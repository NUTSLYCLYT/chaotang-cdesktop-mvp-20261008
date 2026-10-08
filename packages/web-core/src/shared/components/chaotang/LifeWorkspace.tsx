import { useMemo, useState, type FormEvent } from 'react';
import {
  BellIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  HeartIcon,
  LockKeyIcon,
  NotePencilIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  hasLegacyLifeItems,
  readOwnerLifeItems,
  writeOwnerLifeItems,
  type LifeItem,
  type LifeItemKind,
  type LifeStorageRead,
} from '@/shared/components/chaotang/lifeLocalStore';
import { cn } from '@/shared/lib/utils';

type LifeMode = 'today' | 'calendar' | 'reminders' | 'notes' | 'privacy';

const LEGACY_NOTICE = '旧版本机记录已保留，尚未关联账户';
const STORAGE_NOTICE =
  '仅当前设备和账户，不云同步，不自动给Agent，当前设备存储不是加密保险箱';

interface LifeFeedback {
  tone: 'success' | 'error';
  message: string;
}

export function LifeWorkspace({ mode }: { mode: LifeMode }) {
  const { user } = useChaotangProvider();
  if (!user) return <LifeLoginRequired />;
  return <LifeWorkspaceForOwner key={user.id} mode={mode} ownerId={user.id} />;
}

function LifeLoginRequired() {
  return (
    <div className="space-y-double">
      <ChaotangPanel className="p-double">
        <Header
          icon={LockKeyIcon}
          eyebrow="LOCAL LIFE"
          title="请先登录"
          description="生活日程、提醒与笔记按登录账户分别保存在本机。登录后才能读取和保存你自己的生活数据；未登录时不会读取或写入任何生活记录。"
        />
        <p className="mt-double border border-brand/15 bg-primary/35 p-base text-xs leading-relaxed text-low">
          未登录状态下可以查看说明，但不会读取任何本机生活记录（包括旧版本机记录），也不会展示任何账户的生活正文，更不会写入本机生活数据。
        </p>
        <p className="mt-base border border-brand/15 bg-primary/35 p-base text-[10px] leading-relaxed text-low">
          {STORAGE_NOTICE}
        </p>
      </ChaotangPanel>
    </div>
  );
}

function LifeWorkspaceForOwner({
  mode,
  ownerId,
}: {
  mode: LifeMode;
  ownerId: string;
}) {
  const [read, setRead] = useState<LifeStorageRead>(() =>
    readOwnerLifeItems(ownerId)
  );
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(todayKey);
  const [time, setTime] = useState('');
  const [feedback, setFeedback] = useState<LifeFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const items = read.status === 'ready' ? read.items : [];
  const readError = read.status === 'error' ? read.message : null;
  const readBlocked = read.status === 'error';
  const legacy = useMemo(() => hasLegacyLifeItems(), []);
  const today = todayKey();
  const todayItems = useMemo(
    () => items.filter((item) => item.date === today && item.kind !== 'note'),
    [items, today]
  );
  const visibleItems = useMemo(() => {
    if (mode === 'calendar')
      return items.filter((item) => item.kind === 'schedule');
    if (mode === 'reminders')
      return items.filter((item) => item.kind === 'reminder');
    if (mode === 'notes') return items.filter((item) => item.kind === 'note');
    return todayItems;
  }, [items, mode, todayItems]);

  const kind: LifeItemKind =
    mode === 'reminders' ? 'reminder' : mode === 'notes' ? 'note' : 'schedule';

  /** Persist first; only touch the in-memory list when the write succeeded. */
  const persist = (nextItems: LifeItem[]): boolean => {
    if (readBlocked) {
      setFeedback({
        tone: 'error',
        message: '读取异常，已暂停保存；请先重试读取本机记录。',
      });
      return false;
    }
    try {
      writeOwnerLifeItems(ownerId, nextItems);
    } catch {
      setFeedback({
        tone: 'error',
        message:
          '保存失败：本机存储不可用或空间不足，请重试；你的输入与原有记录均已保留。',
      });
      return false;
    }
    setRead({ status: 'ready', items: nextItems });
    return true;
  };

  const addItem = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    const now = new Date().toISOString();
    const nextItem: LifeItem = {
      id: crypto.randomUUID(),
      kind,
      title: title.trim(),
      detail: detail.trim(),
      date: kind === 'note' ? today : date,
      time: kind === 'note' ? '' : time,
      completed: false,
      createdAt: now,
    };
    const saved = persist([nextItem, ...items]);
    setIsSaving(false);
    if (!saved) return;
    setTitle('');
    setDetail('');
    setTime('');
    setFeedback({ tone: 'success', message: '已保存到本机。' });
  };

  const updateItem = (id: string, patch: Partial<LifeItem>) => {
    const nextItems = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    if (persist(nextItems))
      setFeedback({ tone: 'success', message: '已更新本机记录。' });
  };

  const removeItem = (id: string) => {
    if (
      !window.confirm('确定删除这条本机记录吗？此操作不可恢复。') // eslint-disable-line no-alert
    )
      return;
    const nextItems = items.filter((item) => item.id !== id);
    if (persist(nextItems))
      setFeedback({ tone: 'success', message: '已删除本机记录。' });
  };

  const clearAll = () => {
    if (
      !window.confirm(
        '确定清除当前账户在本机保存的全部生活数据吗？此操作不可恢复。' // eslint-disable-line no-alert
      )
    )
      return;
    if (persist([]))
      setFeedback({
        tone: 'success',
        message: '已清除当前账户的本机生活数据。',
      });
  };

  const retryRead = () => {
    setRead(readOwnerLifeItems(ownerId));
    setFeedback(null);
  };

  const statusBar = (
    <LifeStatusBar
      readError={readError}
      onRetryRead={retryRead}
      feedback={feedback}
      legacy={legacy}
    />
  );

  if (mode === 'privacy') {
    return (
      <div className="space-y-double">
        {statusBar}
        <div className="grid gap-double xl:grid-cols-[1.2fr_0.8fr]">
          <ChaotangPanel className="p-double">
            <Header
              icon={LockKeyIcon}
              eyebrow="LOCAL PRIVACY"
              title="生活数据与隐私"
              description="生活模块的数据只保存在当前客户端的浏览器存储中，不进入朝堂业务数据库。"
            />
            <dl className="mt-double space-y-base text-sm">
              <PrivacyRow label="存储位置" value="当前账户的 localStorage" />
              <PrivacyRow label="云端同步" value="关闭" safe />
              <PrivacyRow label="模型自动读取" value="关闭" safe />
              <PrivacyRow label="外部连接器访问" value="关闭" safe />
              <PrivacyRow label="当前记录" value={`${items.length} 条`} />
            </dl>
            <button
              type="button"
              aria-label="清除全部本地生活数据"
              disabled={items.length === 0 || readBlocked}
              onClick={clearAll}
              className="mt-double inline-flex items-center gap-half border border-error/30 px-base py-half text-xs text-error hover:bg-error/5 disabled:opacity-35"
            >
              <TrashIcon className="size-4" /> 清除当前账户本地生活数据
            </button>
          </ChaotangPanel>
          <ChaotangPanel className="p-double">
            <h2 className="chaotang-title text-lg text-high">数据边界</h2>
            <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>{STORAGE_NOTICE}。</li>
              <li>清除浏览器数据会同时删除这些记录。</li>
              <li>更换电脑或客户端不会自动迁移，也不会在不同账户间共享。</li>
              <li>当前没有系统通知权限，也不会在后台主动提醒。</li>
              <li>生活记录不会自动成为 Agent 上下文。</li>
            </ul>
          </ChaotangPanel>
        </div>
      </div>
    );
  }

  if (mode === 'today') {
    const completed = todayItems.filter((item) => item.completed).length;
    return (
      <div className="space-y-double">
        {statusBar}
        <ChaotangPanel className="relative overflow-hidden p-double">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(194,155,76,0.18),transparent_68%)]" />
          <Header
            icon={HeartIcon}
            eyebrow="LOCAL PERSONAL DOMAIN"
            title="今日生活"
            description="把今天真正需要照顾的事项收在一处；所有内容只保存在本机。"
          />
          <div className="relative mt-double grid grid-cols-3 border border-brand/20 bg-primary/35">
            <Metric label="今日事项" value={todayItems.length} />
            <Metric label="已完成" value={completed} />
            <Metric label="待处理" value={todayItems.length - completed} />
          </div>
        </ChaotangPanel>
        <ItemList
          items={visibleItems}
          empty="今天还没有日程或提醒"
          onToggle={(item) =>
            updateItem(item.id, { completed: !item.completed })
          }
          onDelete={removeItem}
        />
      </div>
    );
  }

  const meta = {
    calendar: {
      eyebrow: 'LOCAL CALENDAR',
      title: '本地日程',
      description: '安排日期与时间，不调用系统日历。',
      icon: CalendarBlankIcon,
    },
    reminders: {
      eyebrow: 'LOCAL REMINDERS',
      title: '本地提醒',
      description: '记录需要提醒的事情；当前仅在应用内展示。',
      icon: BellIcon,
    },
    notes: {
      eyebrow: 'LOCAL NOTES',
      title: '生活笔记',
      description: '保存你明确创建的私人笔记，不自动提供给 Agent。',
      icon: NotePencilIcon,
    },
  }[mode];

  return (
    <div className="space-y-double">
      {statusBar}
      <div className="grid gap-double xl:grid-cols-[0.78fr_1.22fr]">
        <ChaotangPanel className="p-double">
          <Header
            icon={meta.icon}
            eyebrow={meta.eyebrow}
            title={meta.title}
            description={meta.description}
          />
          <form
            onSubmit={addItem}
            className="mt-double space-y-base border-t border-brand/15 pt-double"
          >
            <input
              value={title}
              aria-label={mode === 'notes' ? '笔记标题' : '事项名称'}
              onChange={(event) => setTitle(event.target.value.slice(0, 120))}
              placeholder={mode === 'notes' ? '笔记标题' : '事项名称'}
              className={INPUT_CLASS}
            />
            {mode !== 'notes' && (
              <div className="grid grid-cols-2 gap-base">
                <input
                  type="date"
                  aria-label="日期"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  type="time"
                  aria-label="时间"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            )}
            <textarea
              value={detail}
              aria-label={mode === 'notes' ? '笔记内容' : '补充说明'}
              onChange={(event) => setDetail(event.target.value.slice(0, 2000))}
              rows={mode === 'notes' ? 8 : 4}
              placeholder={mode === 'notes' ? '写下内容…' : '补充说明（可选）'}
              className={cn(INPUT_CLASS, 'resize-y')}
            />
            <button
              type="submit"
              disabled={!title.trim() || isSaving || readBlocked}
              className="inline-flex items-center gap-half border border-brand/35 bg-brand/10 px-base py-half text-xs text-brand disabled:opacity-35"
            >
              <PlusIcon className="size-4" />{' '}
              {isSaving
                ? '保存中…'
                : mode === 'notes'
                  ? '保存笔记'
                  : '添加事项'}
            </button>
          </form>
        </ChaotangPanel>
        <ItemList
          items={visibleItems}
          empty={mode === 'notes' ? '还没有生活笔记' : '还没有记录'}
          onToggle={(item) =>
            updateItem(item.id, { completed: !item.completed })
          }
          onDelete={removeItem}
        />
      </div>
    </div>
  );
}

function LifeStatusBar({
  readError,
  onRetryRead,
  feedback,
  legacy,
}: {
  readError: string | null;
  onRetryRead: () => void;
  feedback: LifeFeedback | null;
  legacy: boolean;
}) {
  return (
    <div className="space-y-half">
      {readError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-base border border-error/30 bg-error/5 p-base text-xs text-error"
        >
          <span className="min-w-0 break-words">{readError}</span>
          <button
            type="button"
            aria-label="重试读取"
            onClick={onRetryRead}
            className="shrink-0 border border-error/40 px-base py-half hover:bg-error/10"
          >
            重试读取
          </button>
        </div>
      )}
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'break-words border p-base text-xs',
            feedback.tone === 'error'
              ? 'border-error/30 bg-error/5 text-error'
              : 'border-brand/20 bg-brand/5 text-normal'
          )}
        >
          {feedback.message}
        </p>
      )}
      {legacy && (
        <p className="border border-brand/15 bg-primary/35 p-base text-xs text-low">
          {LEGACY_NOTICE}
        </p>
      )}
      <p className="border border-brand/15 bg-primary/35 p-base text-[10px] leading-relaxed text-low">
        {STORAGE_NOTICE}
      </p>
    </div>
  );
}

function Header({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof HeartIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex items-start gap-base">
      <div className="border border-brand/35 bg-brand/10 p-base text-brand">
        <Icon className="size-6" weight="duotone" />
      </div>
      <div>
        <p className="text-[9px] tracking-[0.24em] text-brand/55">{eyebrow}</p>
        <h1 className="chaotang-title mt-half text-2xl text-high">{title}</h1>
        <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
          {description}
        </p>
      </div>
    </div>
  );
}

function ItemList({
  items,
  empty,
  onToggle,
  onDelete,
}: {
  items: LifeItem[];
  empty: string;
  onToggle: (item: LifeItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ChaotangPanel className="p-double">
      <div className="flex items-center justify-between border-b border-brand/15 pb-base">
        <h2 className="chaotang-title text-lg text-high">本机记录</h2>
        <span className="text-[9px] text-success">
          LOCAL ONLY · {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-20 text-center text-sm text-low">{empty}</p>
      ) : (
        <div className="mt-base space-y-half">
          {items.map((item) => (
            <article
              key={item.id}
              className="flex items-start gap-base border border-brand/15 bg-primary/35 p-base"
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                className={item.completed ? 'text-success' : 'text-low'}
                aria-label={item.completed ? '标记未完成' : '标记完成'}
              >
                <CheckCircleIcon
                  className="size-5"
                  weight={item.completed ? 'fill' : 'regular'}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-half">
                  <h3
                    className={cn(
                      'break-words text-sm text-high',
                      item.completed && 'line-through opacity-55'
                    )}
                  >
                    {item.title}
                  </h3>
                  <span className="text-[9px] text-brand">
                    {item.kind === 'schedule'
                      ? '日程'
                      : item.kind === 'reminder'
                        ? '提醒'
                        : '笔记'}
                  </span>
                </div>
                {item.detail && (
                  <p className="mt-half whitespace-pre-wrap break-words text-xs leading-relaxed text-low">
                    {item.detail}
                  </p>
                )}
                <p className="mt-half text-[9px] text-low">
                  {item.kind === 'note'
                    ? new Date(item.createdAt).toLocaleString('zh-CN')
                    : `${item.date}${item.time ? ` · ${item.time}` : ''}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-low hover:text-error"
                aria-label="删除"
              >
                <TrashIcon className="size-4" />
              </button>
            </article>
          ))}
        </div>
      )}
    </ChaotangPanel>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-brand/15 p-base text-center last:border-r-0">
      <p className="chaotang-title text-2xl text-brand">{value}</p>
      <p className="mt-half text-[9px] text-low">{label}</p>
    </div>
  );
}
function PrivacyRow({
  label,
  value,
  safe = false,
}: {
  label: string;
  value: string;
  safe?: boolean;
}) {
  return (
    <div className="flex justify-between gap-base border-b border-brand/10 pb-base">
      <dt className="text-low">{label}</dt>
      <dd className={safe ? 'text-success' : 'text-normal'}>{value}</dd>
    </div>
  );
}
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const INPUT_CLASS =
  'w-full border border-brand/20 bg-primary/55 px-base py-base text-sm text-normal outline-none placeholder:text-low/60 focus:border-brand/50';
