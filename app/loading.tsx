import Illustration from '@/components/Illustration'
// 路由级加载态：页面切换或服务端渲染时显示
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="页面加载中"
      className="flex flex-col items-center justify-center min-h-[60vh]"
    >
      {/* 固定尺寸 + aspect-square：加载完成时插画区不产生布局跳动 */}
      <div className="w-32 h-32 aspect-square shrink-0">
        <Illustration name="loading" className="w-full h-full" />
      </div>
      <div
        aria-hidden="true"
        className="mt-4 w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin shrink-0"
      />
      <p className="mt-3 text-gray-500 text-sm">加载中…</p>
    </div>
  )
}
