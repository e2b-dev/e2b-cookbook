// Turns a title into a URL slug: "Hello, World!" -> "hello-world".
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
}
