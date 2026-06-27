import { IdiomSelector } from '@/components/IdiomSelector'
import { TaskQueue } from '@/components/TaskQueue'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：成语选择 */}
          <div className="lg:col-span-2">
            <IdiomSelector />
          </div>
          
          {/* 右侧：任务队列 */}
          <div className="lg:col-span-1">
            <TaskQueue compact={true} />
          </div>
        </div>
      </div>
    </main>
  )
}