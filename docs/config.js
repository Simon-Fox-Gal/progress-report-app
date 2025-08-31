/*
 * config.js
 *
 * Exposes a CONFIG object on the global window that defines where
 * project JSON files live.  To point the Reader at your own
 * repository you only need to edit the values below.
 *
 * GITHUB_USER: your GitHub username or organisation
 * REPO:        the repository name containing the project JSON files
 * BRANCH:      the branch hosting the JSON (e.g. 'main' or 'gh-pages')
 * DATA_PATH:   the folder path inside the repository where
 *              all project JSON files are stored (relative to the
 *              repository root, without a leading slash).  For
 *              example, if your files live in <repo>/projects then
 *              set DATA_PATH = 'projects'.
 */
window.CONFIG = {
  GITHUB_USER: 'Simon-Fox-Gal',
  REPO:        'progress-report-app',
  BRANCH:      'main',
  DATA_PATH:   'projects'   // this must match the folder name that holds your JSON
};

