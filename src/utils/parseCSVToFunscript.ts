export const parseCSVToFunscript = (csvText: string) => {
  try {
    // Split the CSV by lines and filter out empty lines
    const lines = csvText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    const actions = [];

    // Check if there's a header line (contains non-numeric characters in first column)
    let startIndex = 0;
    if (isNaN(parseFloat(lines[0].split(",")[0]))) {
      startIndex = 1;
    }

    // Parse each line
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(",");
      actions.push({
        at: Math.round(parseFloat(columns[0].trim())),
        pos: Math.min(
          100,
          Math.max(0, Math.round(parseFloat(columns[1].trim())))
        ),
      });
    }

    return {
      actions: actions,
      name: "Converted from CSV",
    };
  } catch (error) {
    console.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};
