export type DiscordResourceSelectOption = {
  id: string;
  name: string;
};

type RawTextChannel = {
  id: string;
  name: string;
};

type RawCategoryChannel = {
  id: string;
  name: string;
};

type RawRole = {
  id: string;
  name: string;
};

export function mapDiscordTextChannelOptions(
  channels: RawTextChannel[],
): DiscordResourceSelectOption[] {
  return channels.map((channel) => ({
    id: channel.id,
    name: `# ${channel.name}`,
  }));
}

export function mapDiscordCategoryOptions(
  categories: RawCategoryChannel[],
): DiscordResourceSelectOption[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
}

export function mapDiscordRoleOptions(
  roles: RawRole[],
): DiscordResourceSelectOption[] {
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
  }));
}

export function mergeDiscordResourceOptions(
  fetched: DiscordResourceSelectOption[],
  preserveIds: string[],
  missingLabel: (id: string) => string,
) {
  const merged = new Map(fetched.map((option) => [option.id, option]));

  for (const id of preserveIds) {
    if (!id || merged.has(id)) continue;
    merged.set(id, {
      id,
      name: missingLabel(id),
    });
  }

  const fetchedOrder = fetched.map((option) => option.id);
  const preservedOnly = [...merged.values()].filter(
    (option) => !fetchedOrder.includes(option.id),
  );

  return [
    ...fetched,
    ...preservedOnly.sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR"),
    ),
  ];
}
