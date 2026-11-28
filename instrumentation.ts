// Runs once when the server starts (Next.js instrumentation hook). Warms the
// slow first-use steps in the background so the first question does not pay
// for them: probing Manim (importing it takes a few seconds), loading the
// Rust text core, and embedding the notes library when an embedder is set.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const started = Date.now();
  void Promise.allSettled([
    import('./lib/manim/render').then((m) => m.getManimStatus()),
    import('./lib/native/core').then((m) => m.nativeCore()),
    import('./lib/rag/hybrid').then((m) => m.warmLibraryEmbeddings()),
  ]).then((results) => {
    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(`[lemmaslop] warm-up finished in ${Date.now() - started} ms${failed ? ` (${failed} step(s) failed)` : ''}`);
  });
}
