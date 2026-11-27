import type {Metadata} from 'next';
import {LossChart} from '@/components/LossChart';
import {getIndex} from '@/lib/rag/load';

export const metadata: Metadata = {
  title: 'Library and index, LemmaSlop',
  description: 'How the notes library is embedded and partitioned with e-means.',
};

export default function LibraryPage() {
  const index = getIndex();
  const t = index.training;
  const notes = new Set(index.chunks.map((c) => c.noteId)).size;
  const lloydFinal = t.lloydCurve[t.lloydCurve.length - 1].mse;
  const crossing = t.emeansCurve.find((p) => p.mse < lloydFinal);

  const params: [string, string, string][] = [
    ['n', String(t.n), 'passages (vectors) clustered'],
    ['d', String(t.d), 'LSA dimensions kept from the TF-IDF matrix'],
    ['k', String(t.k), 'cells: 4√n to a power of two, as in the paper'],
    ['T', String(t.epochs), 'epochs for the index in use'],
    ['B', String(t.batchSize), 'batch size from the batch law, Eq. 7'],
    ['α₀', t.alpha0.toFixed(3), 'peak step from the step law, Eq. 6'],
    ['M', String(t.updates), 'EMA updates, T⌊n/B⌋'],
    ['revived', String(t.revived), 'dead cells split back to life'],
    ['MSE', t.finalLoss.toFixed(4), 'after last-epoch-mean finalization'],
    ['Lloyd', t.lloydLoss25.toFixed(4), 'same seed, 25 iterations'],
  ];

  return (
    <main className="library" id="main">
      <header className="library-head">
        <h1 className="library-title">
          {t.n} passages from {notes} notes, filed into {t.k} cells by e-means.
        </h1>
        <p className="library-lede">
          Each passage is a TF-IDF vector projected onto {t.d} latent dimensions. The cells come from e-means,
          mini-batch k-means with exponential-moving-average centroids (Bessa et al., arXiv:2611.09501). A question
          is matched against the nearest {index.ivf.nprobe} cells and fused with keyword search.
        </p>
      </header>

      <section className="report" aria-labelledby="report-title">
        <div className="report-chart">
          <h2 id="report-title" className="section-title">
            {crossing
              ? `e-means passes Lloyd's 25-iteration loss with a ${crossing.epochs}-epoch budget`
              : 'e-means against Lloyd on this library'}
          </h2>
          <LossChart emeans={t.emeansCurve} lloyd={t.lloydCurve} seeds={t.seeds} />
        </div>
        <div className="report-params">
          <h2 className="section-title">Index parameters</h2>
          <table className="param-table">
            <tbody>
              {params.map(([sym, value, note]) => (
                <tr key={sym}>
                  <th scope="row">{sym}</th>
                  <td className="num">{value}</td>
                  <td>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-note">
            The paper reports e-means beating 25 Lloyd epochs within 1.4 to 2.6 epochs on datasets of millions of
            vectors, and says its laws are not tuned for tiny ones. Here n is {t.n} and each cell holds about{' '}
            {(t.n / t.k).toFixed(1)} passages, so the crossover comes later; read B and α₀ as the laws extrapolated,
            not as tuned values.
          </p>
        </div>
      </section>

      <section className="cells" aria-labelledby="cells-title">
        <h2 id="cells-title" className="section-title">
          The {t.k} cells
        </h2>
        <ol className="cell-list">
          {index.ivf.clusters.map((c) => (
            <li key={c.id} className="cell">
              <div className="cell-head">
                <span className="cell-id num">C{c.id}</span>
                <span className="cell-terms">{c.terms.join(', ')}</span>
                <span className="cell-size num">{c.size}</span>
              </div>
              <ul className="cell-passages">
                {index.ivf.lists[c.id].map((i) => {
                  const ch = index.chunks[i];
                  return (
                    <li key={ch.id}>
                      <span className="cell-heading">{ch.heading}</span>
                      <span className="cell-note">
                        {ch.noteTitle}&nbsp;§{ch.section}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
