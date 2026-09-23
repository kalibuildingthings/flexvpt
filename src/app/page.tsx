import { FlexVptApp } from "@/components/flexvpt-app";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">FlexVPT</h1>
        <p className="mt-2 text-muted-foreground">Ask for a workout day. Get a split.</p>
      </header>
      <FlexVptApp />
    </main>
  );
}
