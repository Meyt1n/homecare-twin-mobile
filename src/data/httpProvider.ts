import { ApiClient } from '@/api/client'
import type { HealthEvent, Member, RequestOptions } from '@/api/types'
import type {
  CareTask,
  DataProvider,
  MemberDetail,
  MemberSummary,
  ProviderInfo,
  QualityCheckResult,
  RecognitionCandidate,
  RiskCard,
  TaskAction,
  TaskActionPayload,
  TimelineItem,
  TodaySnapshot,
} from './types'

/**
 * 联机模式适配器：调用主仓库（issedu_ysu2026_3709）FastAPI 的既有接口。
 *
 * 诚实状态说明：这是移动端的起步适配层——成员、时间线、风险、计划确认/延期/跳过、
 * 质量门控与视觉任务创建都调用真实 API；“今日任务”由计划类事件推导，字段映射
 * 需要在与家庭服务器联调时按 OpenAPI 校准后才能宣布“已验证”。
 */

interface SessionContext {
  actorId: string
  accessPurpose: string
}

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const PLAN_EVENT_TYPES = new Set(['CARE_PLAN_CREATED', 'CARE_PLAN_UPDATED', 'PLAN_REMINDER'])

function isPlanLikeEvent(event: HealthEvent): boolean {
  return PLAN_EVENT_TYPES.has(event.event_type) || event.event_type.startsWith('CARE_PLAN')
}

function eventTitle(event: HealthEvent): string {
  const payload = event.payload ?? {}
  const title = payload['title'] ?? payload['name'] ?? payload['summary']
  if (typeof title === 'string' && title.trim()) return title
  return event.event_type
}

function toTimelineItem(event: HealthEvent): TimelineItem {
  return {
    id: event.id,
    eventType: event.event_type,
    title: eventTitle(event),
    confirmationStatus: event.confirmation_status,
    occurredAt: event.occurred_at ?? event.created_at,
    source: event.source,
  }
}

export class HttpDataProvider implements DataProvider {
  private readonly client: ApiClient
  private readonly context: () => SessionContext
  private householdId: string | null = null
  private memberCache = new Map<string, Member>()
  private taskCache = new Map<string, CareTask>()

  constructor(client: ApiClient, context: () => SessionContext) {
    this.client = client
    this.context = context
  }

  private options(extra: Partial<RequestOptions> = {}): RequestOptions {
    const { actorId, accessPurpose } = this.context()
    return {
      actorId: actorId || undefined,
      accessPurpose: accessPurpose || undefined,
      ...extra,
    }
  }

  private async resolveHouseholdId(): Promise<string> {
    if (this.householdId) return this.householdId
    const households = await this.client.listHouseholds(this.options())
    const first = households[0]
    if (!first) throw new Error('当前身份看不到任何家庭，请先在网页端创建家庭或检查授权')
    this.householdId = first.id
    return first.id
  }

  info(): ProviderInfo {
    return {
      mode: 'live',
      label: '家庭服务器',
      detail: '连接主仓库 FastAPI；仅在授权范围内读取数据，健康数据不出家庭可信域。',
    }
  }

  async listMembers(): Promise<MemberSummary[]> {
    const householdId = await this.resolveHouseholdId()
    const members = await this.client.listMembers(householdId, this.options())
    this.memberCache = new Map(members.map(m => [m.id, m]))

    const summaries: MemberSummary[] = []
    for (const member of members) {
      let severe = 0
      let warning = 0
      let pending = 0
      try {
        const risks = await this.client.listMemberRisks(householdId, member.id, this.options())
        severe = risks.severe_count
        warning = risks.warning_count
      } catch {
        // 无授权或规则暂不可用时不猜测，保持 0 并由详情页提示。
      }
      try {
        const timeline = await this.client.listMemberTimeline(householdId, member.id, this.options())
        pending = timeline.filter(e => isPlanLikeEvent(e) && e.confirmation_status === 'UNCONFIRMED').length
      } catch {
        pending = 0
      }
      summaries.push({
        id: member.id,
        name: member.display_name,
        relation: member.role === 'SELF' ? '本人' : '家庭成员',
        role: member.role,
        avatarText: member.display_name.slice(0, 1),
        visibleScope: 'FULL',
        pendingTaskCount: pending,
        severeRiskCount: severe,
        warningRiskCount: warning,
      })
    }
    return summaries
  }

  async getMemberDetail(memberId: string): Promise<MemberDetail> {
    const householdId = await this.resolveHouseholdId()
    const summaries = await this.listMembers()
    const summary = summaries.find(s => s.id === memberId)
    if (!summary) throw new Error('成员不存在或未获授权')

    let timeline: MemberDetail['timeline']
    try {
      const events = await this.client.listMemberTimeline(householdId, memberId, this.options())
      timeline = events.map(toTimelineItem)
    } catch {
      timeline = 'UNAUTHORIZED'
    }

    return {
      summary,
      // 用药结构化投影接口在主仓库仍在交付中，联机模式暂以时间线为主。
      medications: 'UNAUTHORIZED',
      timeline,
      authorizations: [],
    }
  }

  async getTodaySnapshot(memberId: string): Promise<TodaySnapshot> {
    const householdId = await this.resolveHouseholdId()
    const [events, risks] = await Promise.all([
      this.client.listMemberTimeline(householdId, memberId, this.options()),
      this.listRisks(memberId),
    ])

    const memberName = this.memberCache.get(memberId)?.display_name ?? '成员'
    const tasks: CareTask[] = events
      .filter(e => isPlanLikeEvent(e) && e.confirmation_status === 'UNCONFIRMED')
      .map(e => {
        const task: CareTask = {
          id: `plan-${e.id}`,
          memberId,
          memberName,
          title: eventTitle(e),
          detail: '来自家庭服务器的计划事件，确认/延期/跳过会写回事件中心。',
          level: 'GENERAL',
          dueAt: e.occurred_at ?? e.created_at,
          status: 'PENDING',
          planEventId: e.id,
        }
        return task
      })
    for (const task of tasks) this.taskCache.set(task.id, task)

    return {
      memberId,
      tasks,
      risks,
      recentEvents: events.slice(0, 4).map(toTimelineItem),
    }
  }

  async listRisks(memberId?: string): Promise<RiskCard[]> {
    const householdId = await this.resolveHouseholdId()
    if (!memberId) {
      const members = await this.client.listMembers(householdId, this.options())
      const all = await Promise.all(members.map(m => this.listRisks(m.id).catch(() => [] as RiskCard[])))
      return all.flat()
    }
    const memberName = this.memberCache.get(memberId)?.display_name ?? '成员'
    const response = await this.client.listMemberRisks(householdId, memberId, this.options())
    return response.alerts.map(alert => ({
      ruleId: alert.rule_id,
      ruleVersion: '服务端版本',
      level: alert.level,
      message: alert.message,
      memberId,
      memberName,
      createdAt: alert.created_at,
      sourceCount: alert.source_event_ids.length,
      explanation: '由家庭服务器确定性规则计算得出；证据事件见下方列表。',
      suggestion: '请查看依据后在授权范围内处理；如有医疗疑问请联系医生或药师。',
      acknowledged: false,
      sourceEvents: [],
    }))
  }

  async getRiskDetail(memberId: string, ruleId: string): Promise<RiskCard> {
    const householdId = await this.resolveHouseholdId()
    const detail = await this.client.getRiskDetail(householdId, memberId, ruleId, this.options())
    const memberName = this.memberCache.get(memberId)?.display_name ?? '成员'
    return {
      ruleId: detail.alert.rule_id,
      ruleVersion: '服务端版本',
      level: detail.alert.level,
      message: detail.alert.message,
      memberId,
      memberName,
      createdAt: detail.alert.created_at,
      sourceCount: detail.source_events.length,
      explanation: '由家庭服务器确定性规则计算得出；以下为脱敏的证据事件摘要。',
      suggestion: '请查看依据后在授权范围内处理；如有医疗疑问请联系医生或药师。',
      acknowledged: false,
      sourceEvents: detail.source_events.map(e => ({
        id: e.id,
        eventType: e.event_type,
        confirmationStatus: e.confirmation_status,
        createdAt: e.created_at,
      })),
    }
  }

  async acknowledgeRisk(memberId: string, ruleId: string): Promise<RiskCard> {
    // 主仓库暂未提供风险“已知晓”写接口；联机模式如实拒绝，不伪装成功。
    throw new Error(`联机模式暂不支持在手机上记录“已知晓”（${memberId}/${ruleId}），请在网页端处理`)
  }

  async submitTaskAction(
    taskId: string,
    action: TaskAction,
    payload: TaskActionPayload = {},
  ): Promise<CareTask> {
    const householdId = await this.resolveHouseholdId()
    const task = this.taskCache.get(taskId)
    if (!task?.planEventId) throw new Error('任务已过期，请刷新后重试')
    const options = this.options({ idempotencyKey: createIdempotencyKey() })

    if (action === 'confirm') {
      await this.client.confirmCarePlan(householdId, task.memberId, task.planEventId, options)
      task.status = 'CONFIRMED'
    } else if (action === 'defer') {
      const hours = payload.deferHours ?? 1
      await this.client.deferCarePlan(householdId, task.memberId, task.planEventId, hours, options)
      task.status = 'DEFERRED'
    } else {
      const reason = payload.reason?.trim()
      if (!reason) throw new Error('跳过前请填写原因，便于家人了解情况')
      await this.client.skipCarePlan(householdId, task.memberId, task.planEventId, reason, options)
      task.status = 'SKIPPED'
      task.skipReason = reason
    }
    task.lastActionAt = new Date().toISOString()
    return { ...task }
  }

  async checkImageQuality(file: File): Promise<QualityCheckResult> {
    const response = await this.client.checkVisionQuality(file, this.options())
    return {
      decision: response.decision,
      reasons: response.reasons,
      retakePrompts: response.retake_prompts,
      metrics: Object.entries(response.metrics).map(([key, metric]) => ({
        label: key,
        value: `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`,
        passed: metric.passed,
      })),
      qualityReceipt: response.quality_receipt,
    }
  }

  async recognizeMedicine(file: File, memberId: string): Promise<RecognitionCandidate> {
    const quality = await this.checkImageQuality(file)
    if (quality.decision !== 'PASS' || !quality.qualityReceipt) {
      throw new Error('图片未通过质量门控，请按提示重拍')
    }
    const uploaded = await this.client.uploadFile(file, this.options())
    const task = await this.client.createVisionTask(
      {
        file_id: uploaded.storage_key,
        member_id: memberId,
        quality_receipt: quality.qualityReceipt,
        idempotency_key: createIdempotencyKey(),
      },
      this.options(),
    )
    return {
      status: 'REVIEW',
      fields: [
        { label: '视觉任务', value: task.id, source: '主数据', confidence: 1 },
        { label: '任务状态', value: task.status, source: '主数据', confidence: 1 },
      ],
      conflicts: [],
      versions: { 服务端: task.model_version ?? '等待家庭服务器处理' },
      requiresHumanConfirmation: true,
      notice:
        '照片已通过质量门控并创建视觉识别任务。识别与多证据融合在家庭服务器上执行，完成后请在网页端“人工复核中心”确认候选。',
    }
  }
}
