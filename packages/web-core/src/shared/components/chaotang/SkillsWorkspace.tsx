import { useMemo, useState } from 'react';
import { CpuIcon, LockKeyIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { useChaotangSkills } from '@/shared/hooks/chaotang/useSkills';
import {
  useChaotangProvider,
  type ChaotangSkillCatalogItem,
  type ChaotangSkillLayer,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const LAYER_LABEL: Record<ChaotangSkillLayer, string> = {
  chancellor: '中枢',
  council: '军机处',
  ministry: '六部',
  bureau: '专业司局',
};

export function SkillsWorkspace() {
  const { user, health } = useChaotangProvider();
  const catalog = useChaotangSkills();
  const [layer, setLayer] = useState<ChaotangSkillLayer>();
  const [selectedId, setSelectedId] = useState<string>();

  const visible = useMemo(
    () =>
      catalog.data?.items.filter((item) => !layer || item.layer === layer) ??
      [],
    [catalog.data, layer]
  );
  const selected = catalog.data?.items.find(
    (item) => item.skillId === selectedId
  );

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : 'Skills 注册表未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          目录只展示后端权威注册表，不从客户端扫描或加载技能。
        </p>
      </ChaotangPanel>
    );
  }
  if (catalog.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (catalog.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {catalog.error.message}
      </ChaotangPanel>
    );
  }

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '注册技能', value: catalog.data.total },
          { label: '已启用', value: catalog.data.enabledCount },
          { label: '专业司局', value: catalog.data.layerCounts.bureau },
          { label: '明确禁用', value: catalog.data.disabledCount },
        ].map((item) => (
          <ChaotangPanel key={item.label} className="p-base">
            <p className="text-xs text-low">{item.label}</p>
            <p className="chaotang-title mt-half text-2xl text-brand">
              {item.value}
            </p>
          </ChaotangPanel>
        ))}
      </div>

      <ChaotangPanel className="p-base">
        <div className="flex items-start gap-base">
          <ShieldCheckIcon
            className="mt-half size-5 shrink-0 text-success"
            weight="duotone"
          />
          <div>
            <p className="text-sm text-high">只读权威注册表</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              当前页面仅展示中枢与下游 Runtime Skills
              的身份和权限边界，不执行技能、不改变启用状态，也不把 Skills
              变成第二套业务 Runtime。
            </p>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center justify-between gap-base">
            <div className="flex items-center gap-base">
              <CpuIcon className="size-5 text-brand" weight="duotone" />
              <h2 className="chaotang-title text-lg text-high">Skills 目录</h2>
            </div>
            <span className="text-xs text-low">{visible.length} 项</span>
          </div>
          <div className="mt-base flex flex-wrap gap-half">
            <FilterButton active={!layer} onClick={() => setLayer(undefined)}>
              全部
            </FilterButton>
            {(Object.keys(LAYER_LABEL) as ChaotangSkillLayer[]).map((value) => (
              <FilterButton
                key={value}
                active={layer === value}
                onClick={() => setLayer(value)}
              >
                {LAYER_LABEL[value]}
              </FilterButton>
            ))}
          </div>
          <div className="mt-double max-h-[650px] space-y-half overflow-y-auto">
            {visible.map((skill) => (
              <button
                key={`${skill.source}:${skill.skillId}`}
                type="button"
                onClick={() => setSelectedId(skill.skillId)}
                className={cn(
                  'w-full border p-base text-left',
                  selectedId === skill.skillId
                    ? 'border-brand/45 bg-brand/10'
                    : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                )}
              >
                <div className="flex items-start justify-between gap-base">
                  <p className="break-all font-mono text-xs text-high">
                    {skill.skillId}
                  </p>
                  <span
                    className={skill.enabled ? 'text-success' : 'text-error'}
                  >
                    {skill.enabled ? '●' : '○'}
                  </span>
                </div>
                <p className="mt-half text-[10px] text-low">
                  {LAYER_LABEL[skill.layer]} · {skill.agentId} · v
                  {skill.version}
                </p>
              </button>
            ))}
          </div>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selected ? (
            <EmptyState>选择一个 Skill 查看职责与权限边界</EmptyState>
          ) : (
            <SkillDetail skill={selected} />
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function SkillDetail({ skill }: { skill: ChaotangSkillCatalogItem }) {
  return (
    <article>
      <div className="flex items-start gap-base border-b border-brand/15 pb-double">
        <LockKeyIcon
          className="mt-half size-6 shrink-0 text-brand"
          weight="duotone"
        />
        <div className="min-w-0">
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            {LAYER_LABEL[skill.layer]} · {skill.source}
          </p>
          <h2 className="chaotang-title mt-half break-all text-2xl text-high">
            {skill.skillId}
          </h2>
          <p className="mt-half font-mono text-xs text-low">
            {skill.agentId} · v{skill.version}
          </p>
        </div>
        <span
          className={cn(
            'ml-auto shrink-0 border px-base py-half text-[9px]',
            skill.enabled
              ? 'border-success/30 text-success'
              : 'border-error/30 text-error'
          )}
        >
          {skill.enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>
      <p className="mt-double text-sm leading-7 text-normal">{skill.purpose}</p>
      <DetailList title="允许服务" items={skill.allowedServices} />
      <DetailList title="禁止动作" items={skill.forbiddenActions} danger />
      {skill.allowedEntrypoints.length > 0 && (
        <DetailList title="允许入口" items={skill.allowedEntrypoints} />
      )}
      <p className="mt-double border-t border-brand/15 pt-double text-xs leading-relaxed text-low">
        此目录没有运行、安装、删除或修改 Skill 的能力。
      </p>
    </article>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border px-base py-half text-[10px]',
        active
          ? 'border-brand/45 bg-brand/10 text-brand'
          : 'border-brand/15 text-low hover:border-brand/30'
      )}
    >
      {children}
    </button>
  );
}

function DetailList({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: string[];
  danger?: boolean;
}) {
  return (
    <section className="mt-double">
      <h3 className={danger ? 'text-xs text-error' : 'text-xs text-brand'}>
        {title}
      </h3>
      <ul className="mt-base space-y-half text-xs leading-relaxed text-low">
        {items.map((item) => (
          <li key={item} className="border-l border-brand/25 pl-base">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
