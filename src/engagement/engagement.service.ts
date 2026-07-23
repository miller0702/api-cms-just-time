import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentStatus,
  ContentType,
  EngagementEventType,
  PublishStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type PublishBucket = { total: number; published: number }

function fromStatusGroups(
  rows: Array<{ status: PublishStatus; _count: { _all: number } }>,
): PublishBucket {
  let total = 0
  let published = 0
  for (const row of rows) {
    total += row._count._all
    if (row.status === PublishStatus.published) published += row._count._all
  }
  return { total, published }
}

@Injectable()
export class EngagementService {
  /** Cache corta: el dashboard no necesita datos en tiempo real al segundo. */
  private statsCache: { at: number; data: unknown } | null = null
  private static readonly STATS_TTL_MS = 20_000

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async resolveContent(type: ContentType, slug: string) {
    if (type === ContentType.news) {
      const item = await this.prisma.news.findUnique({ where: { slug } });
      if (!item || item.status !== PublishStatus.published) {
        throw new NotFoundException('Contenido no encontrado');
      }
      return item;
    }
    const item = await this.prisma.pill.findUnique({ where: { slug } });
    if (!item || item.status !== PublishStatus.published) {
      throw new NotFoundException('Contenido no encontrado');
    }
    return item;
  }

  private async bump(
    type: ContentType,
    id: string,
    field: 'viewCount' | 'likeCount' | 'shareCount' | 'commentCount',
    delta: number,
  ) {
    const data = { [field]: { increment: delta } };
    if (type === ContentType.news) {
      return this.prisma.news.update({ where: { id }, data });
    }
    return this.prisma.pill.update({ where: { id }, data });
  }

  async trackView(type: ContentType, slug: string, visitorKey?: string) {
    const item = await this.resolveContent(type, slug);
    if (visitorKey) {
      const recent = await this.prisma.contentEngagement.findFirst({
        where: {
          contentType: type,
          contentId: item.id,
          eventType: EngagementEventType.view,
          visitorKey,
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 30) },
        },
      });
      if (recent) {
        return { ok: true, viewCount: item.viewCount, deduped: true };
      }
    }
    await this.prisma.contentEngagement.create({
      data: {
        contentType: type,
        contentId: item.id,
        eventType: EngagementEventType.view,
        visitorKey: visitorKey || null,
      },
    });
    const updated = await this.bump(type, item.id, 'viewCount', 1);
    return { ok: true, viewCount: updated.viewCount };
  }

  async toggleLike(type: ContentType, slug: string, visitorKey: string) {
    if (!visitorKey?.trim()) {
      throw new BadRequestException('visitorKey requerido');
    }
    const item = await this.resolveContent(type, slug);
    const existing = await this.prisma.contentEngagement.findFirst({
      where: {
        contentType: type,
        contentId: item.id,
        eventType: EngagementEventType.like,
        visitorKey,
      },
    });
    if (existing) {
      await this.prisma.contentEngagement.delete({ where: { id: existing.id } });
      const updated = await this.bump(type, item.id, 'likeCount', -1);
      return { liked: false, likeCount: Math.max(0, updated.likeCount) };
    }
    await this.prisma.contentEngagement.create({
      data: {
        contentType: type,
        contentId: item.id,
        eventType: EngagementEventType.like,
        visitorKey,
      },
    });
    const updated = await this.bump(type, item.id, 'likeCount', 1);
    return { liked: true, likeCount: updated.likeCount };
  }

  async likedByVisitor(type: ContentType, slug: string, visitorKey?: string) {
    const item = await this.resolveContent(type, slug);
    if (!visitorKey) return { liked: false, likeCount: item.likeCount };
    const existing = await this.prisma.contentEngagement.findFirst({
      where: {
        contentType: type,
        contentId: item.id,
        eventType: EngagementEventType.like,
        visitorKey,
      },
    });
    return { liked: Boolean(existing), likeCount: item.likeCount };
  }

  async trackShare(
    type: ContentType,
    slug: string,
    channel?: string,
    visitorKey?: string,
  ) {
    const item = await this.resolveContent(type, slug);
    await this.prisma.contentEngagement.create({
      data: {
        contentType: type,
        contentId: item.id,
        eventType: EngagementEventType.share,
        visitorKey: visitorKey || null,
        channel: channel || null,
      },
    });
    const updated = await this.bump(type, item.id, 'shareCount', 1);
    return { ok: true, shareCount: updated.shareCount };
  }

  async listComments(type: ContentType, slug: string, admin = false) {
    const item = await this.resolveContent(type, slug);
    return this.prisma.contentComment.findMany({
      where: {
        contentType: type,
        contentId: item.id,
        ...(admin ? {} : { status: CommentStatus.approved }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createComment(
    type: ContentType,
    slug: string,
    data: { authorName: string; authorEmail?: string; body: string },
  ) {
    const item = await this.resolveContent(type, slug);
    const authorName = data.authorName?.trim();
    const body = data.body?.trim();
    if (!authorName || !body) {
      throw new BadRequestException('Nombre y comentario requeridos');
    }
    const comment = await this.prisma.contentComment.create({
      data: {
        contentType: type,
        contentId: item.id,
        authorName,
        authorEmail: data.authorEmail?.trim() || null,
        body,
        status: CommentStatus.pending,
      },
    });
    void this.notifications.notifyComment(comment);
    return comment;
  }

  listAdminComments(
    status?: CommentStatus,
    contentType?: ContentType,
    contentId?: string,
  ) {
    return this.prisma.contentComment.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(contentType ? { contentType } : {}),
        ...(contentId ? { contentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async moderateComment(id: string, status: CommentStatus) {
    const comment = await this.prisma.contentComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    const updated = await this.prisma.contentComment.update({
      where: { id },
      data: { status },
    });
    if (
      comment.status !== CommentStatus.approved &&
      status === CommentStatus.approved
    ) {
      await this.bump(comment.contentType, comment.contentId, 'commentCount', 1);
    }
    if (
      comment.status === CommentStatus.approved &&
      status !== CommentStatus.approved
    ) {
      await this.bump(comment.contentType, comment.contentId, 'commentCount', -1);
    }
    return updated;
  }

  async deleteComment(id: string) {
    const comment = await this.prisma.contentComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    await this.prisma.contentComment.delete({ where: { id } });
    if (comment.status === CommentStatus.approved) {
      await this.bump(comment.contentType, comment.contentId, 'commentCount', -1);
    }
    return { ok: true };
  }

  async adminStats() {
    if (
      this.statsCache &&
      Date.now() - this.statsCache.at < EngagementService.STATS_TTL_MS
    ) {
      return this.statsCache.data
    }

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
    const engagementSelect = {
      id: true,
      title: true,
      slug: true,
      viewCount: true,
      likeCount: true,
      shareCount: true,
      commentCount: true,
    } as const

    const [
      newsGroups,
      pillGroups,
      serviceGroups,
      projectGroups,
      pageGroups,
      leadGroups,
      commentsPending,
      mediaTotal,
      topNews,
      topPills,
      recentLeads,
      leadDays,
    ] = await Promise.all([
      this.prisma.news.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.pill.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.service.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.saleProject.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.page.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.contentComment.count({
        where: { status: CommentStatus.pending },
      }),
      this.prisma.mediaAsset.count(),
      this.prisma.news.findMany({
        where: { status: PublishStatus.published },
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: engagementSelect,
      }),
      this.prisma.pill.findMany({
        where: { status: PublishStatus.published },
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: engagementSelect,
      }),
      this.prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
               COUNT(*)::int AS count
        FROM cms.leads
        WHERE created_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
    ])

    const byDay: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      byDay[d.toISOString().slice(0, 10)] = 0
    }
    for (const row of leadDays) {
      const key =
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day).slice(0, 10)
      if (key in byDay) byDay[key] = Number(row.count) || 0
    }

    let leadsTotal = 0
    let leadsNew = 0
    let leadsInProgress = 0
    let leadsDone = 0
    for (const row of leadGroups) {
      const n = row._count._all
      leadsTotal += n
      if (row.status === 'new') leadsNew = n
      else if (row.status === 'in_progress') leadsInProgress = n
      else if (row.status === 'done') leadsDone = n
    }

    const data = {
      content: {
        news: fromStatusGroups(newsGroups),
        pills: fromStatusGroups(pillGroups),
        services: fromStatusGroups(serviceGroups),
        projects: fromStatusGroups(projectGroups),
        pages: fromStatusGroups(pageGroups),
      },
      leads: {
        total: leadsTotal,
        new: leadsNew,
        inProgress: leadsInProgress,
        done: leadsDone,
        last30Days: Object.entries(byDay).map(([date, count]) => ({
          date,
          count,
        })),
      },
      commentsPending,
      mediaTotal,
      topEngagement: [
        ...topNews.map((n) => ({ ...n, type: 'news' as const })),
        ...topPills.map((p) => ({ ...p, type: 'pill' as const })),
      ]
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 6),
      recentLeads,
    }

    this.statsCache = { at: Date.now(), data }
    return data
  }
}
