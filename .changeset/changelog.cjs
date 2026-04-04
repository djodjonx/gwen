const githubChangelog = require('@changesets/changelog-github');

function hasGithubToken() {
  const token = process.env.GITHUB_TOKEN;
  return typeof token === 'string' && token.trim().length > 0;
}

function formatSummary(changeset) {
  const summary = (changeset.summary || '').trim();
  if (!summary) {
    return '- Miscellaneous changes';
  }
  const firstLine = summary.split('\n')[0].trim();
  return `- ${firstLine}`;
}

module.exports = {
  async getReleaseLine(changeset, type, options) {
    if (hasGithubToken()) {
      return githubChangelog.getReleaseLine(changeset, type, options);
    }
    return formatSummary(changeset);
  },

  async getDependencyReleaseLine(changesets, dependenciesUpdated, options) {
    if (hasGithubToken()) {
      return githubChangelog.getDependencyReleaseLine(changesets, dependenciesUpdated, options);
    }

    if (!dependenciesUpdated || dependenciesUpdated.length === 0) {
      return '';
    }

    return `- Updated dependencies: ${dependenciesUpdated.join(', ')}`;
  },
};
