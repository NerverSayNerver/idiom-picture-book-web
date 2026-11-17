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
        <img
          src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20book%20illustration%2C%20a%20cute%20little%20snail%20carrying%20a%20stack%20of%20colorful%20story%20books%20on%20its%20back%2C%20walking%20slowly%2C%20peach%20pink%20and%20cream%20pastel%20color%20palette%2C%20soft%20watercolor%20style%2C%20whimsical%2C%20no%20text&image_size=square"
          alt="加载中"
          className="w-full h-full rounded-full object-cover animate-snail-bob snail-wobble"
          loading="lazy"
        />
      </div>
      <div
        aria-hidden="true"
        className="mt-4 w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin shrink-0"
      />
      <p className="mt-3 text-gray-500 text-sm">加载中…</p>
    </div>
  )
}
