import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, requireAdmin } from "@/lib/admin";

const LIMIT = 300;

type Caption = {
  id: string;
  content: string | null;
  created_datetime_utc: string;
  image_id: string;
  caption_request_id: number | null;
  like_count: number;
};

// Everything a chain has produced, grouped by generation run (one image -> several captions)
export default async function MediaPage({ params }: PageProps<"/chains/[id]/media">) {
  const { supabase } = await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [{ data: chain }, { data: captions, error }] = await Promise.all([
    supabase.from("humor_flavors").select("id, slug").eq("id", id).maybeSingle<{ id: number; slug: string }>(),
    supabase
      .from("captions")
      .select("id, content, created_datetime_utc, image_id, caption_request_id, like_count")
      .eq("humor_flavor_id", id)
      .order("created_datetime_utc", { ascending: false })
      .limit(LIMIT)
      .returns<Caption[]>(),
  ]);
  if (!chain) notFound();

  const imageIds = [...new Set((captions ?? []).map((c) => c.image_id))];
  const { data: images } = imageIds.length
    ? await supabase.from("images").select("id, url").in("id", imageIds).returns<{ id: string; url: string | null }[]>()
    : { data: [] };
  const imageUrl = new Map((images ?? []).map((i) => [i.id, i.url]));

  // Group by generation request (older captions without one are grouped by image)
  const groups = new Map<string, Caption[]>();
  for (const caption of captions ?? []) {
    const key = caption.caption_request_id ? `r${caption.caption_request_id}` : `i${caption.image_id}`;
    groups.set(key, [...(groups.get(key) ?? []), caption]);
  }

  return (
    <>
      <header className="page-head">
        <Link href={`/chains/${id}`} className="text-link small">← {chain.slug}</Link>
        <h1>Generated media</h1>
        <p className="muted">Captions produced by the {chain.slug} chain, newest first.</p>
      </header>

      {error && <p className="alert alert-error">Couldn&apos;t load captions: {error.message}</p>}
      {!captions?.length && !error && (
        <p className="muted">
          Nothing yet. <Link href={`/chains/${id}`} className="text-link">Generate some captions</Link> to see them here.
        </p>
      )}

      <div className="media-list">
        {[...groups.entries()].map(([key, group]) => {
          const url = imageUrl.get(group[0].image_id);
          return (
            <section key={key} className="card media-run">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url ? <img src={url} alt="" loading="lazy" className="media-img" /> : <div className="media-img empty">No image</div>}
              <div>
                <p className="muted small">
                  {group[0].caption_request_id ? `Request #${group[0].caption_request_id} · ` : ""}
                  {formatDate(group[0].created_datetime_utc, true)}
                </p>
                <ul className="captions">
                  {group.map((c) => (
                    <li key={c.id}>
                      {c.content}
                      {c.like_count ? <span className="muted small"> · {c.like_count} likes</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
      {captions?.length === LIMIT && <p className="muted small">Showing the newest {LIMIT} captions.</p>}
    </>
  );
}
