// Synthetic test data only. This is not a third-party API schema or accuracy evidence.
import fs from 'node:fs';
const names = { strong: 'Morrow Studio', average: 'Earthkind Living', weak: 'Northstar Works' };
for (const [tier, name] of Object.entries(names))
  for (const [pi, platform] of ['instagram', 'facebook', 'linkedin', 'youtube'].entries()) {
    const quality = tier === 'strong' ? 3 : tier === 'average' ? 2 : 1;
    const n = quality === 3 ? 42 : quality === 2 ? [24, 15, 9, 10][pi] : 4;
    const followers =
      quality === 3
        ? [28400, 14200, 9800, 6700][pi]
        : quality === 2
          ? [12800, 4300, 1820, 960][pi]
          : [420, 180, 95, 40][pi];
    const posts = Array.from({ length: n }, (_, i) => ({
      id: `${platform}-${tier}-${i}`,
      daysAgo:
        quality === 3 ? 1 + i * 2.5 : quality === 2 ? [2, 6, 12, 8][pi] + i * [3, 5, 9, 8][pi] : 27 + i * 24,
      type:
        platform === 'youtube'
          ? 'video'
          : i % 4 === 0
            ? 'reel'
            : i % 3 === 0
              ? 'carousel'
              : platform === 'linkedin'
                ? 'text'
                : 'image',
      likes:
        i === 2 && quality !== 3
          ? null
          : Math.round(
              followers *
                (quality === 3 ? 0.035 : quality === 2 ? [0.017, 0.006, 0.009, 0.015][pi] : 0.002) *
                (1 + (i % 5) / 8),
            ),
      comments: Math.round(followers * (quality === 3 ? 0.002 : quality === 2 ? 0.0008 : 0.0001)) + (i % 3),
      shares: platform === 'instagram' ? null : 3 + (i % 7),
      views: platform === 'youtube' ? Math.round(followers * 1.4 + i * 12) : null,
      isPinned: i === n - 1 && platform !== 'youtube',
      captionPreview: [
        'Small changes. A better everyday.',
        'Made with intention, designed to last.',
        'A closer look at what we are building.',
        'Meet the people behind the process.',
        'Your next chapter starts here.',
      ][i % 5],
    }));
    const raw = {
      synthetic: true,
      fixtureVersion: 1,
      platform,
      tier,
      status: tier === 'weak' && platform === 'facebook' ? 'private' : 'ok',
      sampleComplete: tier === 'weak',
      subscriberHidden: tier === 'weak' && platform === 'youtube',
      profile: {
        displayName: name,
        followers: tier === 'weak' && platform === 'youtube' ? null : followers,
        following: platform === 'youtube' ? null : 312,
        totalPosts: n * 7,
        verified: quality === 3,
        isBusiness: quality > 1,
        category: quality > 1 ? 'Design & lifestyle' : null,
        bio: quality > 1 ? 'Thoughtfully made. For a life well lived.' : null,
        bioLink: quality > 1 ? 'https://example.com' : null,
        avatarUrl: quality > 1 ? 'https://example.com/synthetic-avatar.png' : null,
      },
      posts,
    };
    fs.mkdirSync(`fixtures/${platform}`, { recursive: true });
    fs.writeFileSync(`fixtures/${platform}/raw-mock-${tier}.json`, JSON.stringify(raw, null, 2) + '\n');
  }
