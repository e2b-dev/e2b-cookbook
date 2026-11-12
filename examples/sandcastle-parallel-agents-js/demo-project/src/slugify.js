// Turns a title into a URL slug: "Hello World!" -> "hello-world"
export function slugify(title) {
  return title
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
