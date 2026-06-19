export type ImportedClassSchedule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  className: string;
  capacity: number;
  instructorName: string | null;
};

const DAY_ALIASES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  segundafeira: 1,
  seg: 1,
  terca: 2,
  tercafeira: 2,
  teraa: 2,
  teraafeira: 2,
  ter: 2,
  quarta: 3,
  quartafeira: 3,
  qua: 3,
  quinta: 4,
  quintafeira: 4,
  qui: 4,
  sexta: 5,
  sextafeira: 5,
  sex: 5,
  sabado: 6,
  sab: 6,
};

function normalizedKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function requiredText(value: unknown, field: string, rowNumber: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Item ${rowNumber}: o campo "${field}" e obrigatorio.`);
  }
  return value.trim();
}

function parseTime(value: unknown, field: string, rowNumber: number) {
  const text = requiredText(value, field, rowNumber);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new Error(`Item ${rowNumber}: "${field}" deve estar no formato HH:mm.`);
  }
  return text;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function normalizeImportedName(value: string) {
  return normalizedKey(value);
}

export function importColorForName(name: string) {
  const palette = ["#2563eb", "#0f9d58", "#db2777", "#7c3aed", "#d97706", "#0891b2", "#dc2626", "#4f46e5"];
  const hash = [...normalizeImportedName(name)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  return palette[hash % palette.length];
}

export function parseClassScheduleImport(rawJson: string): ImportedClassSchedule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("JSON invalido. Revise virgulas, aspas e colchetes.");
  }

  if (!Array.isArray(parsed)) throw new Error("O JSON deve conter uma lista de horarios.");
  if (!parsed.length) throw new Error("O arquivo nao possui horarios para importar.");
  if (parsed.length > 500) throw new Error("Importe no maximo 500 horarios por vez.");

  return parsed.map((item, index) => {
    const rowNumber = index + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Item ${rowNumber}: cada horario deve ser um objeto JSON.`);
    }

    const row = item as Record<string, unknown>;
    const dayText = requiredText(row.diaSemana, "diaSemana", rowNumber);
    const dayOfWeek = DAY_ALIASES[normalizedKey(dayText)];
    if (dayOfWeek === undefined) throw new Error(`Item ${rowNumber}: dia da semana "${dayText}" nao reconhecido.`);

    const startTime = parseTime(row.horarioInicio, "horarioInicio", rowNumber);
    const endTime = parseTime(row.horarioFim, "horarioFim", rowNumber);
    const durationMinutes = minutesFromTime(endTime) - minutesFromTime(startTime);
    if (durationMinutes < 15 || durationMinutes > 240) {
      throw new Error(`Item ${rowNumber}: o horario final deve ficar entre 15 e 240 minutos apos o inicio.`);
    }

    const className = requiredText(row.modalidade, "modalidade", rowNumber);
    if (className.length > 120) throw new Error(`Item ${rowNumber}: modalidade com mais de 120 caracteres.`);

    const capacity = Number(row.capacidade);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
      throw new Error(`Item ${rowNumber}: capacidade deve ser um numero inteiro entre 1 e 200.`);
    }

    const instructorName = typeof row.professor === "string" && row.professor.trim()
      ? row.professor.trim()
      : null;

    return {
      dayOfWeek,
      startTime,
      endTime,
      durationMinutes,
      className,
      capacity,
      instructorName,
    };
  });
}
