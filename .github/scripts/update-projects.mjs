import { readFile, writeFile } from "node:fs/promises";

const START_MARKER = "<!-- AUTO-PROJECTS:START -->";
const END_MARKER = "<!-- AUTO-PROJECTS:END -->";
const README_PATH = "README.md";
const PROJECT_LIMIT = 6;

const username = process.env.PROFILE_USERNAME || "LUCIENIN";
const profileRepository = process.env.PROFILE_REPOSITORY || username;

function escapeTableCell(value) {
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

function updatedDate(repository) {
  return new Date(repository.pushed_at).toISOString().slice(0, 10);
}

function projectTable(repositories) {
  if (repositories.length === 0) {
    return "_New public projects will appear here automatically._";
  }

  const rows = repositories.map((repository) => {
    const name = escapeTableCell(repository.name);
    const description = escapeTableCell(repository.description || "No description yet.");
    const language = escapeTableCell(repository.language || "Other");
    const activity = `\`${language}\` · ⭐ ${repository.stargazers_count} · Updated ${updatedDate(repository)}`;
    return `| [${name}](${repository.html_url}) | ${description} | ${activity} |`;
  });

  return [
    "| Project | Description | Activity |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

async function fetchRepositories() {
  const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`);
  url.searchParams.set("type", "owner");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "100");

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${username}-profile-readme`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const repositories = await response.json();
  return repositories
    .filter((repository) =>
      repository.name !== profileRepository &&
      !repository.fork &&
      !repository.archived &&
      !repository.disabled
    )
    .sort((left, right) => new Date(right.pushed_at) - new Date(left.pushed_at))
    .slice(0, PROJECT_LIMIT);
}

async function main() {
  const readme = await readFile(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("README project markers are missing or out of order.");
  }

  const repositories = await fetchRepositories();
  const replacement = `${START_MARKER}\n${projectTable(repositories)}\n${END_MARKER}`;
  const updatedReadme = `${readme.slice(0, start)}${replacement}${readme.slice(end + END_MARKER.length)}`;

  if (updatedReadme !== readme) {
    await writeFile(README_PATH, updatedReadme);
    console.log(`Updated README with ${repositories.length} public projects.`);
  } else {
    console.log(`README is already current with ${repositories.length} public projects.`);
  }
}

await main();
