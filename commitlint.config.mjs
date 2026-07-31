// Keeps commit subjects parsable by semantic-release, which derives the next
// version number from the type of every commit since the previous tag.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // semantic-release ignores the body/footer width, so do not fail on it
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'header-max-length': [2, 'always', 100]
  }
}
