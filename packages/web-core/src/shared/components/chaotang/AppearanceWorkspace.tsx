import {
  EyeIcon,
  MoonStarsIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import {
  useChaotangAppearance,
  type ChaotangSceneTone,
} from '@/shared/hooks/chaotang/useChaotangAppearance';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const TONES: Array<{
  value: ChaotangSceneTone;
  label: string;
  description: string;
}> = [
  {
    value: 'ink',
    label: '沉墨',
    description: '降低亮度与饱和度，适合长时间工作。',
  },
  {
    value: 'balanced',
    label: '墨金',
    description: '默认朝堂视觉，兼顾场景与内容。',
  },
  { value: 'vivid', label: '华彩', description: '增强色彩和明暗层次。' },
];

export function AppearanceWorkspace() {
  const { settings, update, reset } = useChaotangAppearance();

  return (
    <div className="grid gap-double xl:grid-cols-[1.25fr_0.75fr]">
      <ChaotangPanel className="p-double">
        <div className="flex items-center gap-base border-b border-brand/15 pb-double">
          <SlidersHorizontalIcon
            className="size-6 text-brand"
            weight="duotone"
          />
          <div>
            <p className="text-[9px] tracking-[0.2em] text-brand/55">
              LOCAL APPEARANCE
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              外观设置
            </h2>
          </div>
        </div>

        <section className="mt-double">
          <h3 className="text-xs text-brand">场景色调</h3>
          <div className="mt-base grid gap-base sm:grid-cols-3">
            {TONES.map((tone) => (
              <button
                key={tone.value}
                type="button"
                onClick={() => update({ sceneTone: tone.value })}
                className={cn(
                  'border p-base text-left',
                  settings.sceneTone === tone.value
                    ? 'border-brand/50 bg-brand/10'
                    : 'border-brand/15 bg-primary/35 hover:border-brand/30'
                )}
              >
                <span className="chaotang-title text-base text-high">
                  {tone.label}
                </span>
                <span className="mt-base block text-[10px] leading-relaxed text-low">
                  {tone.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-double border-t border-brand/15 pt-double">
          <div className="flex items-center justify-between gap-base">
            <div>
              <h3 className="text-sm text-high">背景强度</h3>
              <p className="mt-half text-xs text-low">
                调整七个主模块场景图的可见程度。
              </p>
            </div>
            <span className="chaotang-title text-xl text-brand">
              {settings.backgroundIntensity}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.backgroundIntensity}
            onChange={(event) =>
              update({ backgroundIntensity: Number(event.target.value) })
            }
            className="mt-double w-full accent-[hsl(var(--brand))]"
            aria-label="背景强度"
          />
          <div className="mt-half flex justify-between text-[9px] text-low">
            <span>纯内容</span>
            <span>完整场景</span>
          </div>
        </section>

        <section className="mt-double space-y-base border-t border-brand/15 pt-double">
          <ToggleRow
            title="沉浸模式"
            description="降低场景遮罩，让建筑和远景更清晰。"
            checked={settings.immersiveMode}
            onChange={(checked) => update({ immersiveMode: checked })}
          />
          <ToggleRow
            title="降低动态效果"
            description="关闭背景淡入、界面过渡和非必要动画。"
            checked={settings.reducedMotion}
            onChange={(checked) => update({ reducedMotion: checked })}
          />
        </section>

        <div className="mt-double border-t border-brand/15 pt-double">
          <button
            type="button"
            onClick={reset}
            className="border border-brand/25 px-base py-half text-xs text-brand hover:bg-brand/10"
          >
            恢复默认外观
          </button>
        </div>
      </ChaotangPanel>

      <div className="space-y-double">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <EyeIcon className="size-5 text-brand" weight="duotone" />
            <h2 className="chaotang-title text-lg text-high">当前效果</h2>
          </div>
          <dl className="mt-double space-y-base text-xs">
            <Value
              label="主题"
              value={
                TONES.find((tone) => tone.value === settings.sceneTone)!.label
              }
            />
            <Value
              label="背景强度"
              value={`${settings.backgroundIntensity}%`}
            />
            <Value
              label="沉浸模式"
              value={settings.immersiveMode ? '开启' : '关闭'}
            />
            <Value
              label="动态效果"
              value={settings.reducedMotion ? '已降低' : '标准'}
            />
          </dl>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-start gap-base">
            <MoonStarsIcon
              className="mt-half size-5 shrink-0 text-success"
              weight="duotone"
            />
            <div>
              <h2 className="chaotang-title text-lg text-high">本机持久化</h2>
              <p className="mt-base text-xs leading-relaxed text-low">
                外观偏好只保存在当前客户端，不写入朝堂业务数据库，也不会随账户上传。
              </p>
            </div>
          </div>
        </ChaotangPanel>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-double border border-brand/15 bg-primary/35 p-base">
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-high">{title}</span>
        <span className="mt-half block text-xs text-low">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[hsl(var(--brand))]"
      />
    </label>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-base border-b border-brand/10 pb-base">
      <dt className="text-low">{label}</dt>
      <dd className="text-normal">{value}</dd>
    </div>
  );
}
