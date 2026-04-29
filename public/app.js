const modeInputs = Array.from(document.querySelectorAll("input[name='resumeMode']"));
const generateBtn = document.querySelector("#generateBtn");
const copyPromptBtn = document.querySelector("#copyPromptBtn");
const exportPdfBtn = document.querySelector("#exportPdfBtn");
const copyJsonBtn = document.querySelector("#copyJsonBtn");
const statusText = document.querySelector("#statusText");
const existingResumeWrap = document.querySelector("#existingResumeWrap");
const jobDescriptionWrap = document.querySelector("#jobDescriptionWrap");

const inputs = {
  fullName: document.querySelector("#fullNameInput"),
  jobTitle: document.querySelector("#jobTitleInput"),
  company: document.querySelector("#companyInput"),
  years: document.querySelector("#yearsInput"),
  email: document.querySelector("#emailInput"),
  phone: document.querySelector("#phoneInput"),
  location: document.querySelector("#locationInput"),
  linkedin: document.querySelector("#linkedinInput"),
  portfolio: document.querySelector("#portfolioInput"),
  headline: document.querySelector("#headlineInput"),
  strengths: document.querySelector("#strengthsInput"),
  achievements: document.querySelector("#achievementsInput"),
  existingResume: document.querySelector("#existingResumeInput"),
  jobDescription: document.querySelector("#jobDescriptionInput")
};

const outputs = {
  header: document.querySelector("#headerOutput"),
  summary: document.querySelector("#summaryOutput"),
  skills: document.querySelector("#skillsOutput"),
  experience: document.querySelector("#experienceOutput"),
  projects: document.querySelector("#projectsOutput"),
  education: document.querySelector("#educationOutput"),
  certifications: document.querySelector("#certificationsOutput"),
  prompt: document.querySelector("#promptOutput")
};

let latestPayload = null;

modeInputs.forEach((input) => {
  input.addEventListener("change", updateMode);
});

generateBtn.addEventListener("click", generateResumeDraft);
copyPromptBtn.addEventListener("click", () => copyText(outputs.prompt.value, "AI prompt copied."));
copyJsonBtn.addEventListener("click", () => copyText(JSON.stringify(buildExportObject(), null, 2), "Resume JSON copied."));
exportPdfBtn.addEventListener("click", exportPdf);

updateMode();

async function generateResumeDraft() {
  statusText.textContent = "Generating sections...";
  generateBtn.disabled = true;

  try {
    const response = await fetch("/api/resume-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildRequestPayload())
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    latestPayload = await response.json();
    fillOutputs(latestPayload.sections);
    outputs.prompt.value = latestPayload.prompt;
    statusText.textContent = "Draft ready. Edit any section before saving as PDF.";
  } catch (error) {
    statusText.textContent = `Could not generate sections. ${error.message}`;
  } finally {
    generateBtn.disabled = false;
  }
}

function buildRequestPayload() {
  return {
    mode: currentMode(),
    jobTitle: inputs.jobTitle.value,
    targetCompany: inputs.company.value,
    contact: {
      fullName: inputs.fullName.value,
      email: inputs.email.value,
      phone: inputs.phone.value,
      location: inputs.location.value,
      linkedin: inputs.linkedin.value,
      portfolio: inputs.portfolio.value
    },
    profile: {
      years: inputs.years.value,
      headline: inputs.headline.value,
      strengths: splitLines(inputs.strengths.value),
      achievements: splitLines(inputs.achievements.value)
    },
    existingResume: inputs.existingResume.value,
    jobDescription: inputs.jobDescription.value,
    sections: {
      summary: outputs.summary.value,
      skills: splitLines(outputs.skills.value),
      experience: splitLines(outputs.experience.value),
      projects: splitLines(outputs.projects.value),
      education: splitLines(outputs.education.value),
      certifications: splitLines(outputs.certifications.value)
    }
  };
}

function fillOutputs(sections) {
  const headerLines = [
    sections.header.fullName,
    sections.header.jobTitle && `Target role: ${sections.header.jobTitle}`,
    sections.header.targetCompany && `Target company: ${sections.header.targetCompany}`,
    [sections.header.email, sections.header.phone, sections.header.location].filter(Boolean).join(" | "),
    [sections.header.linkedin, sections.header.portfolio].filter(Boolean).join(" | ")
  ].filter(Boolean);

  outputs.header.value = headerLines.join("\n");
  outputs.summary.value = sections.summary || "";
  outputs.skills.value = joinLines(sections.skills);
  outputs.experience.value = joinLines(sections.experience);
  outputs.projects.value = joinLines(sections.projects);
  outputs.education.value = joinLines(sections.education);
  outputs.certifications.value = joinLines(sections.certifications);
}

function currentMode() {
  return modeInputs.find((input) => input.checked)?.value || "scratch";
}

function updateMode() {
  const existingMode = currentMode() === "existing";
  existingResumeWrap.classList.toggle("hidden", !existingMode);
  jobDescriptionWrap.classList.toggle("job-desc-wide", !existingMode);
  document.querySelectorAll(".toggle-card").forEach((card) => {
    card.classList.toggle("active", card.querySelector("input").checked);
  });
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(items) {
  return Array.isArray(items) ? items.join("\n") : "";
}

function copyText(text, successMessage) {
  if (!text) {
    statusText.textContent = "Nothing to copy yet.";
    return;
  }

  navigator.clipboard.writeText(text)
    .then(() => {
      statusText.textContent = successMessage;
    })
    .catch(() => {
      statusText.textContent = "Clipboard access failed.";
    });
}

function buildExportObject() {
  return {
    generatedAt: latestPayload?.generatedAt || new Date().toISOString(),
    header: outputs.header.value,
    summary: outputs.summary.value,
    skills: splitLines(outputs.skills.value),
    experience: splitLines(outputs.experience.value),
    projects: splitLines(outputs.projects.value),
    education: splitLines(outputs.education.value),
    certifications: splitLines(outputs.certifications.value),
    prompt: outputs.prompt.value
  };
}

function exportPdf() {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=1280");
  if (!printWindow) {
    statusText.textContent = "Popup blocked. Allow popups to save as PDF.";
    return;
  }

  const printable = buildPrintableResume();
  printWindow.document.write(printable);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function buildPrintableResume() {
  const data = buildExportObject();

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Resume PDF</title>
        <style>
          body {
            margin: 0;
            padding: 36px;
            color: #101418;
            font-family: Inter, Arial, sans-serif;
            background: #ffffff;
          }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; margin-bottom: 6px; }
          .meta { color: #4b5563; margin-bottom: 20px; line-height: 1.5; }
          section { margin-bottom: 20px; }
          h2 {
            margin-bottom: 8px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 4px;
            font-size: 15px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          ul {
            margin: 8px 0 0 18px;
            padding: 0;
            line-height: 1.55;
          }
          .line-list div { margin: 5px 0; line-height: 1.55; }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(firstLine(data.header) || "Resume")}</h1>
          <div class="meta">${escapeHtml(otherLines(data.header).join(" · "))}</div>
        </header>
        ${printSection("Professional Summary", [data.summary])}
        ${printSection("Skills", data.skills)}
        ${printSection("Experience", data.experience)}
        ${printSection("Projects", data.projects)}
        ${printSection("Education", data.education)}
        ${printSection("Certifications", data.certifications)}
      </body>
    </html>
  `;
}

function printSection(title, items) {
  const cleanItems = items.filter(Boolean);
  if (!cleanItems.length) {
    return "";
  }

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <div class="line-list">
        ${cleanItems.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}
      </div>
    </section>
  `;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0] || "";
}

function otherLines(value) {
  return String(value || "").split(/\r?\n/).slice(1).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
