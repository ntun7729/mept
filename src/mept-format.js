export const FORMAT = {
  sections: ["grammar", "reading", "writing", "listening", "speaking"],
  themes: ["safety drill", "PPE", "engine room", "deck work", "watchkeeping", "mooring", "weather", "emergency duty"]
};

export const MEPT_FORMAT = FORMAT;

export function getSection(sectionId) {
  return { id: sectionId, title: sectionId, tasks: [] };
}

export function validSections() {
  return FORMAT.sections;
}
