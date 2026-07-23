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

@Injectable()
export class EngagementService {
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
    const [
      newsTotal,
      newsPublished,
      pillsTotal,
      pillsPublished,
      servicesTotal,
      servicesPublished,
      projectsTotal,
      projectsPublished,
      pagesTotal,
      pagesPublished,
      leadsTotal,
      leadsNew,
      leadsInProgress,
      leadsDone,
      commentsPending,
      mediaTotal,
      topNews,
      topPills,
      recentLeads,
    ] = await Promise.all([
      this.prisma.news.count(),
      this.prisma.news.count({ where: { status: PublishStatus.published } }),
      this.prisma.pill.count(),
      this.prisma.pill.count({ where: { status: PublishStatus.published } }),
      this.prisma.service.count(),
      this.prisma.service.count({ where: { status: PublishStatus.published } }),
      this.prisma.saleProject.count(),
      this.prisma.saleProject.count({
        where: { status: PublishStatus.published },
      }),
      this.prisma.page.count(),
      this.prisma.page.count({ where: { status: PublishStatus.published } }),
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: 'new' } }),
      this.prisma.lead.count({ where: { status: 'in_progress' } }),
      this.prisma.lead.count({ where: { status: 'done' } }),
      this.prisma.contentComment.count({
        where: { status: CommentStatus.pending },
      }),
      this.prisma.mediaAsset.count(),
      this.prisma.news.findMany({
        where: { status: PublishStatus.published },
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          viewCount: true,
          likeCount: true,
          shareCount: true,
          commentCount: true,
        },
      }),
      this.prisma.pill.findMany({
        where: { status: PublishStatus.published },
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          viewCount: true,
          likeCount: true,
          shareCount: true,
          commentCount: true,
        },
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
    ]);

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    const leadsLast30 = await this.prisma.lead.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const byDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = 0;
    }
    for (const lead of leadsLast30) {
      const key = lead.createdAt.toISOString().slice(0, 10);
      if (key in byDay) byDay[key] += 1;
    }

    return {
      content: {
        news: { total: newsTotal, published: newsPublished },
        pills: { total: pillsTotal, published: pillsPublished },
        services: { total: servicesTotal, published: servicesPublished },
        projects: { total: projectsTotal, published: projectsPublished },
        pages: { total: pagesTotal, published: pagesPublished },
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
    };
  }
}
