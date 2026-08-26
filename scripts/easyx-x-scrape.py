#!/opt/easyx/bin/python
"""List public X/Twitter media without account cookies or API credentials."""

from __future__ import annotations

import json
import re
import sys
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode, urlparse

from curl_cffi import requests


BEARER_TOKEN = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs="
    "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)
GRAPHQL_ROOT = "https://x.com/i/api/graphql"
USER_QUERY = "ck5KkZ8t5cOmoLssopN99Q/UserByScreenName"
MEDIA_QUERY = "E8Wq-_jFSaU7hxVcuOPR9g/UserTweets"

FEATURES = {
    "hidden_profile_subscriptions_enabled": True,
    "payments_enabled": False,
    "rweb_xchat_enabled": False,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "verified_phone_label_enabled": False,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True,
    "subscriptions_feature_can_gift_premium": True,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
}

PAGINATION_FEATURES = {
    "rweb_video_screen_enabled": False,
    "payments_enabled": False,
    "rweb_xchat_enabled": False,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "premium_content_api_read_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "responsive_web_grok_analyze_button_fetch_trends_enabled": False,
    "responsive_web_grok_analyze_post_followups_enabled": True,
    "responsive_web_jetfuel_frame": True,
    "responsive_web_grok_share_attachment_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "responsive_web_grok_show_grok_translated_post": False,
    "responsive_web_grok_analysis_button_from_backend": True,
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_grok_image_annotation_enabled": True,
    "responsive_web_grok_imagine_annotation_enabled": True,
    "responsive_web_grok_community_note_auto_translation_is_enabled": False,
    "responsive_web_enhance_cards_enabled": False,
}


class PublicXScraper:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.headers = {
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.8",
            "Authorization": f"Bearer {BEARER_TOKEN}",
            "Origin": "https://x.com",
            "Referer": "https://x.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/140.0.0.0 Safari/537.36"
            ),
            "x-twitter-active-user": "yes",
            "x-twitter-client-language": "en",
        }

    def request(self, method: str, url: str, **kwargs):
        response = self.session.request(
            method,
            url,
            headers={**self.headers, **kwargs.pop("headers", {})},
            impersonate="chrome",
            timeout=45,
            allow_redirects=True,
            **kwargs,
        )
        if response.status_code >= 400:
            path = urlparse(response.url).path
            raise RuntimeError(f"X public web request returned HTTP {response.status_code} for {path}")
        return response

    def json(self, method: str, url: str, **kwargs):
        response = self.request(method, url, **kwargs)
        try:
            return response.json()
        except ValueError as error:
            raise RuntimeError("X public web request returned invalid JSON") from error

    def activate_guest(self) -> None:
        data = self.json(
            "POST",
            "https://api.x.com/1.1/guest/activate.json",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token = str(data.get("guest_token") or "")
        if not token:
            raise RuntimeError("X did not issue a public guest token")
        self.headers["x-guest-token"] = token

    def graphql(self, query: str, variables: dict, features: dict, field_toggles=None):
        params = {
            "variables": compact_json(variables),
            "features": compact_json(features),
        }
        if field_toggles is not None:
            params["fieldToggles"] = compact_json(field_toggles)
        return self.json("GET", f"{GRAPHQL_ROOT}/{query}?{urlencode(params)}")

    def guest_media(self, handle: str, limit: int) -> list[dict]:
        self.activate_guest()
        user_data = self.graphql(
            USER_QUERY,
            {"screen_name": handle, "withGrokTranslatedBio": False},
            FEATURES,
            {"withAuxiliaryUserLabels": True},
        )
        user = (((user_data.get("data") or {}).get("user") or {}).get("result") or {})
        if user.get("__typename") == "UserUnavailable" or not user.get("rest_id"):
            raise RuntimeError(f"Public X profile @{handle} was not found")
        timeline_data = self.graphql(
            MEDIA_QUERY,
            {
                "userId": str(user["rest_id"]),
                "count": max(20, min(100, limit)),
                "includePromotedContent": False,
                "withQuickPromoteEligibilityTweetFields": False,
                "withVoice": True,
            },
            PAGINATION_FEATURES,
            {"withArticlePlainText": False},
        )
        tweets = []
        seen = set()
        for value in walk(timeline_data):
            legacy = value.get("legacy")
            if not isinstance(legacy, dict) or not legacy.get("id_str"):
                continue
            tweet_id = str(legacy["id_str"])
            if tweet_id in seen:
                continue
            seen.add(tweet_id)
            user_legacy = (((value.get("core") or {}).get("user_results") or {}).get("result") or {}).get("legacy") or {}
            rows = media_from_tweet(legacy, user_legacy, limit - len(tweets))
            for row in rows:
                if "/i/web/status/" in row["pageUrl"]:
                    row["pageUrl"] = f"https://x.com/{handle}/status/{tweet_id}"
            tweets.extend(rows)
            if len(tweets) >= limit:
                break
        return tweets[:limit]

    def syndication_tweet(self, tweet_id: str) -> dict:
        return self.json(
            "GET",
            f"https://cdn.syndication.twimg.com/tweet-result?{urlencode({'id': tweet_id, 'token': '0', 'lang': 'en'})}",
            headers={"Origin": "https://platform.twitter.com", "Referer": "https://platform.twitter.com/"},
        )

    def syndication_media(self, handle: str, limit: int) -> list[dict]:
        response = self.request(
            "GET",
            f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}",
            headers={"Origin": "https://platform.twitter.com", "Referer": "https://platform.twitter.com/"},
        )
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', response.text, re.S)
        if not match:
            raise RuntimeError("X public profile widget returned no timeline")
        data = json.loads(match.group(1))
        ids = []
        for value in walk(data):
            tweet = value.get("tweet")
            if not isinstance(tweet, dict):
                continue
            tweet_id = str(tweet.get("id_str") or tweet.get("id") or "")
            if tweet_id.isdigit() and tweet_id not in ids:
                ids.append(tweet_id)
        media = []
        for tweet_id in ids:
            media.extend(media_from_syndication(self.syndication_tweet(tweet_id), limit - len(media)))
            if len(media) >= limit:
                break
        return media[:limit]


def compact_json(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def extension(url: str, fallback: str) -> str:
    suffix = urlparse(url).path.rsplit("/", 1)[-1].rsplit(".", 1)
    value = suffix[-1].lower() if len(suffix) == 2 else fallback
    return value if re.fullmatch(r"[a-z0-9]{2,5}", value) else fallback


def iso_date(value):
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(str(value))
    except (TypeError, ValueError):
        try:
            parsed = __import__("datetime").datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return parsed.isoformat().replace("+00:00", "Z")


def photo_original(url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname != "pbs.twimg.com":
        return url
    ext = extension(url, "jpg")
    separator = "&" if parsed.query else "?"
    return f"{url}{separator}format={ext}&name=orig"


def best_video(media: dict) -> str | None:
    variants = ((media.get("video_info") or {}).get("variants") or [])
    choices = [item for item in variants if item.get("content_type") == "video/mp4" and item.get("url")]
    if not choices:
        choices = [item for item in ((media.get("video") or {}).get("variants") or []) if item.get("type") == "video/mp4" and item.get("src")]
        return str(max(choices, key=lambda item: int(item.get("bitrate") or 0)).get("src")) if choices else None
    return str(max(choices, key=lambda item: int(item.get("bitrate") or 0)).get("url"))


def media_rows(tweet_id: str, handle: str, title: str, published_at, media_items: list, limit: int) -> list[dict]:
    rows = []
    page_url = f"https://x.com/{handle}/status/{tweet_id}" if handle else f"https://x.com/i/web/status/{tweet_id}"
    for index, media in enumerate(media_items, 1):
        kind = str(media.get("type") or "photo")
        if kind == "photo":
            url = photo_original(str(media.get("media_url_https") or media.get("url") or ""))
            media_type = "image"
            ext = extension(url, "jpg")
        else:
            url = best_video(media) or ""
            media_type = "video"
            ext = "mp4"
        if not url.startswith("http"):
            continue
        original = media.get("original_info") or {}
        rows.append({
            "id": f"x:{tweet_id}:{index}",
            "title": title or f"X post {tweet_id}",
            "pageUrl": page_url,
            "url": url,
            "mediaType": media_type,
            "filename": f"{tweet_id}-{index}.{ext}",
            "publishedAt": iso_date(published_at),
            "width": int(original.get("width") or 0),
            "height": int(original.get("height") or 0),
        })
        if len(rows) >= limit:
            break
    return rows


def media_from_tweet(legacy: dict, user: dict, limit: int) -> list[dict]:
    retweet = ((legacy.get("retweeted_status_result") or {}).get("result") or {})
    if retweet.get("tweet"):
        retweet = retweet["tweet"]
    if retweet.get("legacy"):
        legacy = retweet["legacy"]
        user = (((retweet.get("core") or {}).get("user_results") or {}).get("result") or {}).get("legacy") or user
    media = ((legacy.get("extended_entities") or {}).get("media") or (legacy.get("entities") or {}).get("media") or [])
    return media_rows(
        str(legacy.get("id_str") or ""),
        str(user.get("screen_name") or ""),
        str(legacy.get("full_text") or legacy.get("text") or ""),
        legacy.get("created_at"),
        media,
        limit,
    )


def media_from_syndication(tweet: dict, limit: int) -> list[dict]:
    return media_rows(
        str(tweet.get("id_str") or ""),
        str((tweet.get("user") or {}).get("screen_name") or ""),
        str(tweet.get("text") or ""),
        tweet.get("created_at"),
        tweet.get("mediaDetails") or [],
        limit,
    )


def target(value: str) -> tuple[str, str | None]:
    parsed = urlparse(value if "://" in value else f"https://x.com/{value}")
    if parsed.hostname not in {"x.com", "www.x.com", "twitter.com", "www.twitter.com"}:
        raise RuntimeError("X scraper only accepts x.com or twitter.com URLs")
    parts = [part for part in parsed.path.split("/") if part]
    status_index = next((index for index, part in enumerate(parts) if part == "status"), -1)
    if status_index > 0 and status_index + 1 < len(parts) and parts[status_index + 1].isdigit():
        return parts[0], parts[status_index + 1]
    if not parts or not re.fullmatch(r"[A-Za-z0-9_]{1,15}", parts[0]) or parts[0].lower() in {"home", "explore", "search", "settings", "messages", "notifications", "i"}:
        raise RuntimeError("The X URL does not contain a public profile handle")
    return parts[0], None


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--version":
        print("easyx-x-scrape 1")
        return 0
    if len(sys.argv) not in {2, 3}:
        print("usage: easyx-x-scrape URL [MAX_ITEMS]", file=sys.stderr)
        return 2
    try:
        limit = max(1, min(200, int(sys.argv[2]) if len(sys.argv) == 3 else 30))
        handle, tweet_id = target(sys.argv[1])
        scraper = PublicXScraper()
        if tweet_id:
            media = media_from_syndication(scraper.syndication_tweet(tweet_id), limit)
        else:
            try:
                media = scraper.syndication_media(handle, limit)
            except Exception:
                media = scraper.guest_media(handle, limit)
        print(json.dumps(media, separators=(",", ":")))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
