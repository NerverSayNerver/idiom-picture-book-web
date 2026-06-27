import { IdiomSelector } from '@/components/IdiomSelector'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-secondary/30 to-background">
      <IdiomSelector />
    </main>
  )
}
