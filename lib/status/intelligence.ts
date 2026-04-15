import type { ComponentStatus, StatusTeamNote } from "./types";

type StatusNoteCache = {
  key: string;
  expiresAt: number;
  note: StatusTeamNote;
};

let latestStatusNoteCache: StatusNoteCache | null = null;

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function getOpenAiBaseUrl() {
  return (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
}

function getOpenAiModel() {
  return (
    process.env.OPENAI_STATUS_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

function buildFingerprint(criticalComponents: ComponentStatus[]) {
  return criticalComponents
    .map((component) =>
      [
        component.name,
        component.status,
        component.status_message || "",
        component.latency_ms ?? "",
      ].join("|"),
    )
    .sort()
    .join("::");
}

function buildFallbackNote(criticalComponents: ComponentStatus[]): StatusTeamNote {
  const affectedComponents = criticalComponents.map((component) => component.name);
  const topMessages = criticalComponents
    .map((component) => component.status_message)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return {
    title: "Estamos investigando uma falha critica",
    description:
      topMessages ||
      `Detectamos indisponibilidade em ${affectedComponents.join(", ")}. Nossa equipe tecnica ja iniciou a analise e esta aplicando a estabilizacao do ambiente.`,
    source: "fallback",
    generated_at: new Date().toISOString(),
    affected_components: affectedComponents,
  };
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export async function generateCriticalTeamNote(
  criticalComponents: ComponentStatus[],
): Promise<StatusTeamNote> {
  const fallbackNote = buildFallbackNote(criticalComponents);
  const cacheKey = buildFingerprint(criticalComponents);
  const now = Date.now();

  if (
    latestStatusNoteCache &&
    latestStatusNoteCache.key === cacheKey &&
    latestStatusNoteCache.expiresAt > now
  ) {
    return latestStatusNoteCache.note;
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    latestStatusNoteCache = {
      key: cacheKey,
      expiresAt: now + 30_000,
      note: fallbackNote,
    };
    return fallbackNote;
  }

  try {
    const response = await fetch(`${getOpenAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Voce escreve comunicados curtos para pagina de status. Responda somente JSON com as chaves title e description. O texto deve ser profissional, simples, sem exagero, sem culpar terceiros e sem prometer prazo.",
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                objective:
                  "Gerar uma nota curta para falha critica na pagina de status, em portugues do Brasil simples.",
                affectedComponents: criticalComponents.map((component) => ({
                  name: component.name,
                  status: component.status,
                  latencyMs: component.latency_ms ?? null,
                  detail: component.status_message || null,
                })),
                constraints: {
                  titleMaxWords: 8,
                  descriptionMaxWords: 38,
                },
              },
              null,
              2,
            ),
          },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}`);
    }

    const json = await response.json().catch(() => null);
    const content =
      json?.choices?.[0]?.message?.content && typeof json.choices[0].message.content === "string"
        ? json.choices[0].message.content
        : "";

    const objectText = extractJsonObject(content);
    if (!objectText) {
      throw new Error("Resposta da IA sem JSON valido.");
    }

    const parsed = JSON.parse(objectText) as {
      title?: string;
      description?: string;
    };

    const title = (parsed.title || "").trim();
    const description = (parsed.description || "").trim();

    if (!title || !description) {
      throw new Error("Resposta da IA incompleta.");
    }

    const aiNote: StatusTeamNote = {
      title,
      description,
      source: "ai",
      generated_at: new Date().toISOString(),
      affected_components: criticalComponents.map((component) => component.name),
    };

    latestStatusNoteCache = {
      key: cacheKey,
      expiresAt: now + 30_000,
      note: aiNote,
    };

    return aiNote;
  } catch {
    latestStatusNoteCache = {
      key: cacheKey,
      expiresAt: now + 30_000,
      note: fallbackNote,
    };
    return fallbackNote;
  }
}

export async function generateIncidentSummary(
  day: string,
  components: Array<{ name: string; status: string }>,
): Promise<{ title: string; summary: string; updateMessage: string }> {
  const apiKey = getOpenAiApiKey();
  const dayLabel = new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  });

  const fallback = {
    title: `Instabilidade detectada em ${components.map(c => c.name).join(", ")}`,
    summary: `Em ${dayLabel}, identificamos instabilidade em ${components.map(c => c.name).join(", ")}. Nossa equipe monitorou e os servicos foram normalizados.`,
    updateMessage: "Incidente resolvido. A estabilidade dos sistemas foi confirmada pela nossa equipe de monitoramento."
  };

  if (!apiKey) return fallback;

  try {
    const response = await fetch(`${getOpenAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0.3,
        max_tokens: 250,
        messages: [
          {
            role: "system",
            content: "Você é um engenheiro de SRE escrevendo resumos para uma página de status. Responda APENAS um JSON com 'title', 'summary' e 'updateMessage'. Use um tom profissional, transparente e em português do Brasil."
          },
          {
            role: "user",
            content: JSON.stringify({
              date: dayLabel,
              affectedComponents: components,
              instructions: "Gere um titulo curto, um resumo do que aconteceu em 2 frases, e uma mensagem final de resolucao."
            })
          }
        ]
      }),
      cache: "no-store",
    });

    if (!response.ok) return fallback;
    const json = await response.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        title: parsed.title || fallback.title,
        summary: parsed.summary || fallback.summary,
        updateMessage: parsed.updateMessage || fallback.updateMessage
      };
    }
  } catch {
    // fallback
  }

  return fallback;
}
