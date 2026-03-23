export function setMetaTags({
  title = 'Open Door Christian Church',
  description = 'Welcome to Open Door Christian Church in DeLand, Florida. Join us for worship services, community events, and fellowship.',
  image = 'https://church.cloud.webstack.ceo/uploads/church-header.jpg',
  url = 'https://opendoorchristian.church',
  type = 'website',
}) {
  return {
    title,
    meta: [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image },
      { property: 'og:url', content: url },
      { property: 'og:type', content: type },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  };
}
