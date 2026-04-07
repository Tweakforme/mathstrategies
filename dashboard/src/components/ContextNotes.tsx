"use client";

import { useState, useEffect } from "react";
import { FileText, Save, Loader } from "lucide-react";
import clsx from "clsx";

interface Props {
  fightId: string;
  f1Name: string;
  f2Name: string;
}

export default function ContextNotes({ fightId, f1Name, f2Name }: Props) {
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/fight-notes/${fightId}`)
      .then(r => r.json())
      .then(d => { setNotes(d.notes ?? ""); setLoading(false); })
      .catch(() => setLoading(false));
  }, [fightId]);

  async function save() {
    setSaving(true);
    await fetch(`/api/fight-notes/${fightId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-accent" />
        <h3 className="font-semibold">Your Context Notes</h3>
        <span className="text-xs text-muted ml-1">— things the model can't see</span>
      </div>

      <div className="text-xs text-muted mb-2 space-y-0.5">
        <p>Examples: camp reports · injury news · weight cut issues · motivation · sparring intel · walkout energy</p>
      </div>

      <textarea
        className="w-full bg-white/5 border border-border rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:border-accent/50 placeholder:text-muted"
        rows={4}
        placeholder={`e.g. "${f1Name.split(" ").at(-1)} and ${f2Name.split(" ").at(-1)} trained together at ATT — ${f2Name.split(" ").at(-1)} knows his tendencies"\n"${f1Name.split(" ").at(-1)} missed weight at last camp, possible gas tank issues"\n"${f2Name.split(" ").at(-1)} had a dominant training camp per sources"`}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        disabled={loading}
      />

      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted">Saved per fight — visible to both accounts</p>
        <button
          onClick={save}
          disabled={saving || loading}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
            saved ? "bg-green-500/20 text-green-400" : "btn-primary"
          )}
        >
          {saving ? <Loader className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saved ? "Saved!" : "Save Notes"}
        </button>
      </div>
    </div>
  );
}
