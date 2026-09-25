import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { cn } from '@/shared/lib/utils';

type LifeMode = 'today' | 'calendar' | 'reminders' | 'notes' | 'privacy';
type LifeItemKind = 'schedule' | 'reminder' | 'note';
interface LifeItem {
  id: string;
  kind: LifeItemKind;
  title: string;
  detail: string;
  date: string;
  time: string;
  completed: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'chaotang.life.local.v1';

export function LifeWorkspace({ mode }: { mode: LifeMode }) {
  const [items, setItems] = useState<LifeItem[]>(readItems);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(todayKey);
  const [time, setTime] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Local storage may be unavailable in a restricted browser context.
    }
  }, [items]);

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

  const addItem = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    setItems((current) => [
      {
        id: crypto.randomUUID(),
        kind,
        title: title.trim(),
        detail: detail.trim(),
        date: kind === 'note' ? today : date,
        time: kind === 'note' ? '' : time,
        completed: false,
        createdAt: now,
      },
      ...current,
    ]);
    setTitle('');
    setDetail('');
    setTime('');
  };

  const updateItem = (id: string, patch: Partial<LifeItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  const removeItem = (id: string) =>
    setItems((current) => current.filter((item) => item.id !== id));

  if (mode === 'privacy') {
    return (
      <div className="grid gap-double xl:grid-cols-[1.2fr_0.8fr]">
        <ChaotangPanel className="p-double">
          <Header
            icon={LockKeyIcon}
            eyebrow="LOCAL PRIVACY"
            title="生活数据与隐私"
            description="生活模块的数据只保存在当前客户端的浏览器存储中，不进入朝堂业务数据库。"
          />
          <dl className="mt-double space-y-base text-sm">
            <PrivacyRow label="存储位置" value="当前客户端 localStorage" />
            <PrivacyRow label="云端同步" value="关闭" safe />
            <PrivacyRow label="模型自动读取" value="关闭" safe />
            <PrivacyRow label="外部连接器访问" value="关闭" safe />
            <PrivacyRow label="当前记录" value={`${items.length} 条`} />
          </dl>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  '确定清除当前客户端中的全部生活数据吗？此操作不可恢复。'
                )
              )
                setItems([]);
            }}
            className="mt-double inline-flex items-center gap-half border border-error/30 px-base py-half text-xs text-error hover:bg-error/5 disabled:opacity-35"
          >
            <TrashIcon className="size-4" /> 清除全部本地生活数据
          </button>
        </ChaotangPanel>
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-lg text-high">数据边界</h2>
          <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
            <li>清除浏览器数据会同时删除这些记录。</li>
            <li>更换电脑或客户端不会自动迁移。</li>
            <li>当前没有系统通知权限，也不会在后台主动提醒。</li>
            <li>生活记录不会自动成为 Agent 上下文。</li>
          </ul>
        </ChaotangPanel>
      </div>
    );
  }

  if (mode === 'today') {
    const completed = todayItems.filter((item) => item.completed).length;
    return (
      <div className="space-y-double">
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
            onChange={(event) => setTitle(event.target.value.slice(0, 120))}
            placeholder={mode === 'notes' ? '笔记标题' : '事项名称'}
            className={INPUT_CLASS}
          />
          {mode !== 'notes' && (
            <div className="grid grid-cols-2 gap-base">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={INPUT_CLASS}
              />
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value.slice(0, 2000))}
            rows={mode === 'notes' ? 8 : 4}
            placeholder={mode === 'notes' ? '写下内容…' : '补充说明（可选）'}
            className={cn(INPUT_CLASS, 'resize-y')}
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex items-center gap-half border border-brand/35 bg-brand/10 px-base py-half text-xs text-brand disabled:opacity-35"
          >
            <PlusIcon className="size-4" />{' '}
            {mode === 'notes' ? '保存笔记' : '添加事项'}
          </button>
        </form>
      </ChaotangPanel>
      <ItemList
        items={visibleItems}
        empty={mode === 'notes' ? '还没有生活笔记' : '还没有记录'}
        onToggle={(item) => updateItem(item.id, { completed: !item.completed })}
        onDelete={removeItem}
      />
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
                      'text-sm text-high',
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
                  <p className="mt-half whitespace-pre-wrap text-xs leading-relaxed text-low">
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
function readItems(): LifeItem[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]'
    );
    return Array.isArray(parsed) ? (parsed as LifeItem[]) : [];
  } catch {
    return [];
  }
}
const INPUT_CLASS =
  'w-full border border-brand/20 bg-primary/55 px-base py-base text-sm text-normal outline-none placeholder:text-low/60 focus:border-brand/50';
