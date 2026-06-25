import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface NewBookmarkValues {
  url: string;
  title: string;
}

/**
 * Opens the new-bookmark form when the page is reached with `?newBookmark=1`
 * (used by deep links / external triggers), pre-filling url/title from the
 * query string, then strips those params from the URL.
 */
export function useNewBookmarkFromUrl(onNewBookmark: (values: NewBookmarkValues) => void) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onNewBookmarkRef = useRef(onNewBookmark);
  onNewBookmarkRef.current = onNewBookmark;

  useEffect(() => {
    if (searchParams.get("newBookmark") !== "1") return;

    onNewBookmarkRef.current({
      url: searchParams.get("url") ?? "",
      title: searchParams.get("title") ?? "",
    });

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("newBookmark");
    nextParams.delete("url");
    nextParams.delete("title");

    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);
}
