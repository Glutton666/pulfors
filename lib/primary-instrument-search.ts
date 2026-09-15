import { TUNING_DATA, type InstrumentCategory } from "@/lib/tuning-data";

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function filterPrimaryInstrumentCategories(query: string): InstrumentCategory[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return TUNING_DATA;

  return TUNING_DATA.flatMap((category) => {
    const categoryText = normalizeSearchText(`${category.name.ko} ${category.name.en}`);
    if (categoryText.includes(normalizedQuery)) {
      return [category];
    }

    const instruments = category.instruments.filter((instrument) => {
      const instrumentText = normalizeSearchText(`${instrument.name.ko} ${instrument.name.en}`);
      return instrumentText.includes(normalizedQuery);
    });

    return instruments.length > 0 ? [{ ...category, instruments }] : [];
  });
}