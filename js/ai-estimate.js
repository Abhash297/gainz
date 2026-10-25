// Optional AI nutrition estimate — only used when the user has no match in the
// curated/custom food list and chooses to use it. Calls Anthropic directly from
// the browser with the user's own stored API key; no backend of ours involved.
// Fully optional: manual entry and bare food-name-only logging work without this.
const AIEstimate = {
  async estimate(description) {
    const key = Settings.get().anthropicApiKey;
    if (!key) {
      throw new Error('No API key saved. Add one in Settings to use AI estimates, or enter values manually below.');
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:
          'You estimate nutrition facts for a food or meal description, for the FULL quantity described (not per 100g). ' +
          'Respond with ONLY a JSON object, no prose, no markdown fences: ' +
          '{"kcal": number, "protein": number, "carbs": number, "fat": number} (protein/carbs/fat in grams).',
        messages: [{ role: 'user', content: description }],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${bodyText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse AI response: ' + text.slice(0, 200));

    const parsed = JSON.parse(match[0]);
    return {
      kcal: Number(parsed.kcal) || 0,
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    };
  },
};
