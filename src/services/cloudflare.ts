import axios from 'axios';
import { config } from '../config';

interface CfStats {
  requests: number;
  pageViews: number;
  uniques: number;
}

export async function getCloudflareStats(): Promise<CfStats | null> {
  if (!config.CF_API_TOKEN || !config.CF_ZONE_ID) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    // Try GraphQL endpoint first (best effort)
    const response = await axios.post(
      'https://api.cloudflare.com/client/v4/graphql',
      {
        query: `
          query {
            viewer {
              zones(filter: { zoneTag: "${config.CF_ZONE_ID}" }) {
                httpRequests1dGroups(
                  limit: 1,
                  filter: { date_geq: "${today}", date_leq: "${today}" }
                ) {
                  dimensions { date }
                  sum { requests pageViews bytes }
                  uniq { uniques }
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${config.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const group = response.data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups?.[0];
    if (!group) {
      return null;
    }

    return {
      requests: group.sum?.requests ?? 0,
      pageViews: group.sum?.pageViews ?? 0,
      uniques: group.uniq?.uniques ?? 0,
    };
  } catch (err: any) {
    console.error('Cloudflare analytics error:', err.response?.data?.errors ?? err.message);
    return null;
  }
}
