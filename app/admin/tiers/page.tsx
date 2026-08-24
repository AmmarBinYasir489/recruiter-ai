import { prisma } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { upsertUniversityTierAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminTiers() {
  const tiers = await prisma.universityTier.findMany({ orderBy: { tier: "asc" } });
  const byTier = [1, 2, 3].map((t) => ({ tier: t, items: tiers.filter((x) => x.tier === t) }));
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-2">University tiers</h1>
      <p className="text-slate-500 mb-6">Internal hiring policy (not an external ranking). Changes apply to newly processed CVs.</p>
      <Card className="mb-6">
        <SectionTitle>Add university</SectionTitle>
        <form action={upsertUniversityTierAction} className="grid gap-3 sm:grid-cols-[1fr_100px_110px_auto]">
          <input name="name" className="input" placeholder="University name" required aria-label="University name" />
          <select name="tier" className="input" defaultValue="3" aria-label="Tier"><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
          <input name="score" type="number" min="0" max="100" defaultValue="70" className="input" aria-label="Score" />
          <button className="btn-primary">Add</button>
        </form>
      </Card>
      {byTier.map(({ tier, items }) => (
        <div key={tier} className="mb-5">
          <SectionTitle>Tier {tier} — score {items[0]?.score ?? "—"}</SectionTitle>
          <div className="space-y-2">
            {items.map((t) => (
              <Card key={t.id} className="py-3 px-4">
                <form action={upsertUniversityTierAction} className="grid gap-3 sm:grid-cols-[1fr_100px_110px_auto]">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" className="input" defaultValue={t.name} required aria-label={`University name for ${t.name}`} />
                  <select name="tier" className="input" defaultValue={String(t.tier)} aria-label={`Tier for ${t.name}`}><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
                  <input name="score" type="number" min="0" max="100" defaultValue={t.score} className="input" aria-label={`Score for ${t.name}`} />
                  <button className="btn-outline">Save</button>
                </form>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
