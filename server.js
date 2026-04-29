const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/resume-prompt", (req, res) => {
  const payload = normalizeResumeInput(req.body || {});
  res.json(buildResumeAssistantPayload(payload));
});

function normalizeResumeInput(body) {
  return {
    mode: body.mode === "existing" ? "existing" : "scratch",
    jobTitle: String(body.jobTitle || "").trim(),
    targetCompany: String(body.targetCompany || "").trim(),
    contact: {
      fullName: String(body.contact?.fullName || "").trim(),
      email: String(body.contact?.email || "").trim(),
      phone: String(body.contact?.phone || "").trim(),
      location: String(body.contact?.location || "").trim(),
      linkedin: String(body.contact?.linkedin || "").trim(),
      portfolio: String(body.contact?.portfolio || "").trim()
    },
    profile: {
      years: String(body.profile?.years || "").trim(),
      headline: String(body.profile?.headline || "").trim(),
      strengths: arrayOfStrings(body.profile?.strengths),
      achievements: arrayOfStrings(body.profile?.achievements)
    },
    existingResume: String(body.existingResume || "").trim(),
    jobDescription: String(body.jobDescription || "").trim(),
    sections: {
      summary: String(body.sections?.summary || "").trim(),
      skills: arrayOfStrings(body.sections?.skills),
      experience: arrayOfStrings(body.sections?.experience),
      projects: arrayOfStrings(body.sections?.projects),
      education: arrayOfStrings(body.sections?.education),
      certifications: arrayOfStrings(body.sections?.certifications)
    }
  };
}

function arrayOfStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function buildResumeAssistantPayload(input) {
  const suggestedSections = buildSectionSuggestions(input);

  return {
    generatedAt: new Date().toISOString(),
    prompt: buildPromptText(input, suggestedSections),
    sections: suggestedSections
  };
}

function buildSectionSuggestions(input) {
  const jdKeywords = topKeywords(input.jobDescription, 18);
  const resumeKeywords = topKeywords(input.existingResume, 18);

  const skills = dedupe([
    ...input.sections.skills,
    ...input.profile.strengths,
    ...jdKeywords.slice(0, 10)
  ]);

  const summarySeed = input.sections.summary
    || input.profile.headline
    || [
      input.contact.fullName && `${input.contact.fullName} is applying for ${input.jobTitle || "this role"}.`,
      input.profile.years && `Brings ${input.profile.years} of experience.`,
      skills.length && `Core strengths include ${skills.slice(0, 5).join(", ")}.`
    ].filter(Boolean).join(" ");

  return {
    header: {
      fullName: input.contact.fullName,
      jobTitle: input.jobTitle,
      targetCompany: input.targetCompany,
      email: input.contact.email,
      phone: input.contact.phone,
      location: input.contact.location,
      linkedin: input.contact.linkedin,
      portfolio: input.contact.portfolio
    },
    summary: summarySeed,
    skills,
    experience: input.sections.experience.length
      ? input.sections.experience
      : suggestionsFromText(input.existingResume, ["experience", "worked", "built", "led"], 4),
    projects: input.sections.projects.length
      ? input.sections.projects
      : suggestionsFromText(input.existingResume, ["project", "application", "system", "platform"], 3),
    education: input.sections.education,
    certifications: input.sections.certifications,
    jobKeywords: jdKeywords,
    resumeKeywords
  };
}

function buildPromptText(input, sections) {
  const modeLine = input.mode === "existing"
    ? "The candidate provided an existing resume to improve."
    : "The candidate is building a resume from scratch.";

  return [
    "You are an expert resume writer and ATS optimizer.",
    modeLine,
    `Target role: ${input.jobTitle || "Not provided"}`,
    `Target company: ${input.targetCompany || "Not provided"}`,
    "",
    "Task:",
    "Rewrite the resume so it matches the job description strongly without fabricating experience.",
    "Keep the resume clean, concise, quantified, and ATS-friendly.",
    "Return the result as structured JSON with these keys:",
    'header, summary, skills, experience, projects, education, certifications',
    "",
    "Rules:",
    "- Use strong action verbs.",
    "- Prioritize measurable achievements.",
    "- Mirror important job-description keywords naturally.",
    "- Keep each bullet outcome-focused.",
    "- Do not invent tools, employers, or credentials.",
    "",
    "Candidate details:",
    JSON.stringify({
      contact: sections.header,
      profile: input.profile,
      currentSections: sections
    }, null, 2),
    "",
    "Existing resume text:",
    input.existingResume || "Not provided",
    "",
    "Job description:",
    input.jobDescription || "Not provided"
  ].join("\n");
}

function topKeywords(text, limit) {
  const blacklist = new Set([
    "the", "and", "with", "for", "from", "that", "this", "your", "will", "you", "our",
    "are", "have", "has", "but", "not", "into", "their", "they", "them", "his", "her",
    "its", "job", "role", "work", "team", "years", "year", "must", "should", "than",
    "using", "used", "build", "able", "about", "across", "within", "through"
  ]);

  const counts = new Map();
  String(text || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9+#.-]{2,}/g)
    ?.forEach((word) => {
      if (blacklist.has(word)) {
        return;
      }

      counts.set(word, (counts.get(word) || 0) + 1);
    });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function suggestionsFromText(text, keywords, limit) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean);

  const matches = lines.filter((line) =>
    keywords.some((keyword) => line.toLowerCase().includes(keyword))
  );

  return dedupe(matches).slice(0, limit);
}

function dedupe(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

serverlessSafeListen();

function serverlessSafeListen() {
  app.listen(PORT, () => {
    console.log(`Resume generator studio is listening on ${PORT}`);
  });
}
