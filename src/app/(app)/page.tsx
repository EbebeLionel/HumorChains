import Link from "next/link";
import { formatDate, requireAdmin } from "@/lib/admin";
import SubmitButton from "@/components/SubmitButton";
import { createChain } from "./actions";

const LIMIT = 200;

type Row = {
  id: number;
  slug: string;
  description: string | null;
  created_datetime_utc: string;
  humor_flavor_steps: { count: number }[];
};

export default async function ChainsPage({ searchParams }: PageProps<"/">) {
  const { supabase } = await requireAdmin();
  const { q, error, deleted } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  let query = supabase
    .from("humor_flavors")
    .select("id, slug, description, created_datetime_utc, humor_flavor_steps(count)")
    .order("created_datetime_utc", { ascending: false })
    .limit(LIMIT);
  if (search) {
    const term = search.replace(/[%,()]/g, " ");
    query = query.or(`slug.ilike.%${term}%,description.ilike.%${term}%`);
  }
  const { data: chains, error: loadError } = await query.returns<Row[]>();

  return (
    <>
      <header className="page-head">
        <h1>Prompt chains</h1>
        <p className="muted">
          Each chain is a list of LLM steps that turns an image into captions. Open one to edit, reorder, or run its
          steps.
        </p>
      </header>

      {typeof error === "string" && <p className="alert alert-error">{error}</p>}
      {deleted && <p className="alert alert-ok">Chain deleted.</p>}
      {loadError && <p className="alert alert-error">Couldn&apos;t load chains: {loadError.message}</p>}

      <section className="card">
        <h2>New chain</h2>
        <form action={createChain} className="form-row">
          <label className="field grow">
            <span>Name</span>
            <input name="slug" className="input" placeholder="e.g. campus-puns" required />
          </label>
          <label className="field grow-2">
            <span>Description</span>
            <input name="description" className="input" placeholder="What kind of humor this chain produces" />
          </label>
          <SubmitButton pendingLabel="Creating…">Create chain</SubmitButton>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>All chains</h2>
          <form className="search">
            <input name="q" defaultValue={search} className="input" placeholder="Search by name or description" />
            <button type="submit" className="btn btn-quiet">Search</button>
          </form>
        </div>
        {chains?.length ? (
          <ul className="chain-list">
            {chains.map((chain) => (
              <li key={chain.id}>
                <Link href={`/chains/${chain.id}`} className="chain-link">
                  <span className="chain-name">{chain.slug}</span>
                  <span className="muted small">
                    {chain.humor_flavor_steps[0]?.count ?? 0} steps · created {formatDate(chain.created_datetime_utc)}
                  </span>
                  {chain.description && <span className="small clamp">{chain.description}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{search ? `No chains match "${search}".` : "No chains yet."}</p>
        )}
        {chains?.length === LIMIT && <p className="muted small">Showing the newest {LIMIT}. Search to find older ones.</p>}
      </section>
    </>
  );
}
