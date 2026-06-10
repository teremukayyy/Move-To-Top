// NAME: Move To Top
// AUTHOR: local
// DESCRIPTION: Adds a playlist context-menu action that moves selected tracks to the top.

(function moveToTopExtension() {
  if (typeof Spicetify === "undefined") {
    setTimeout(moveToTopExtension, 100);
    return;
  }

  const REQUIRED_APIS_READY =
    Spicetify?.ContextMenu &&
    Spicetify?.Platform?.PlaylistAPI &&
    Spicetify?.URI &&
    Spicetify?.showNotification;

  if (!REQUIRED_APIS_READY) {
    setTimeout(moveToTopExtension, 100);
    return;
  }

  const MENU_LABEL = "Move To Top";

  function getCurrentPlaylistUri() {
    const pathname =
      Spicetify.Platform?.History?.location?.pathname ||
      Spicetify.Platform?.History?.pathname ||
      window.location.pathname;
    const playlistMatch = pathname?.match(/\/playlist\/([^/?#]+)/);

    return playlistMatch ? `spotify:playlist:${playlistMatch[1]}` : null;
  }

  function isPlaylistContext(contextUri) {
    const playlistUri = contextUri || getCurrentPlaylistUri();

    if (!playlistUri) {
      return false;
    }

    const parsedUri = parseUri(playlistUri);
    return (
      Spicetify.URI.isPlaylistV1OrV2?.(playlistUri) ||
      parsedUri?.type === Spicetify.URI.Type?.PLAYLIST ||
      parsedUri?.type === "playlist" ||
      playlistUri.includes(":playlist:")
    );
  }

  function parseUri(uri) {
    return Spicetify.URI.from?.(uri) || Spicetify.URI.fromString?.(uri);
  }

  function isTrackUri(uri) {
    const parsedUri = parseUri(uri);
    return (
      parsedUri?.type === Spicetify.URI.Type?.TRACK ||
      parsedUri?.type === "track" ||
      String(uri).includes(":track:")
    );
  }

  function getItemUri(item) {
    return item.uri || item.link || item.track?.uri || item.trackMetadata?.link || item.trackMetadata?.uri;
  }

  function getOrderedSelectedUids(items, selectedUids, selectedUris) {
    const selectedUidSet = new Set(selectedUids || []);
    const selectedUriSet = new Set(selectedUris || []);

    return items
      .filter((item) => selectedUidSet.has(item.uid) || selectedUriSet.has(getItemUri(item)))
      .map((item) => item.uid);
  }

  function areSelectedTracksAlreadyAtTop(items, selectedUids) {
    const selected = new Set(selectedUids);
    return items.slice(0, selected.size).every((item) => selected.has(item.uid));
  }

  async function applyPlaylistModification(contextUri, modification) {
    if (Spicetify.Platform.PlaylistAPI._playlistServiceClient?.modify) {
      await Spicetify.Platform.PlaylistAPI._playlistServiceClient.modify({
        uri: contextUri,
        request: modification,
      });
      return;
    }

    await Spicetify.Platform.PlaylistAPI.applyModification(contextUri, modification, true);
  }

  async function moveTracksToTop(uris, uids, contextUri) {
    const playlistUri = contextUri || getCurrentPlaylistUri();

    if (!isPlaylistContext(playlistUri)) {
      Spicetify.showNotification("Open this from a playlist track menu", true);
      return;
    }

    try {
      const { items } = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri);
      const orderedUids = getOrderedSelectedUids(items, uids, uris);

      if (!orderedUids.length) {
        console.warn("[Move To Top] Could not match menu selection", { uris, uids, playlistUri, items });
        Spicetify.showNotification("Could not find selected track in this playlist", true);
        return;
      }

      if (orderedUids.length === items.length || areSelectedTracksAlreadyAtTop(items, orderedUids)) {
        Spicetify.showNotification(
          orderedUids.length > 1 ? "Tracks are already at the top" : "Track is already at the top",
          false
        );
        return;
      }

      const orderedUidSet = new Set(orderedUids);
      const firstUnselectedItem = items.find((item) => !orderedUidSet.has(item.uid));

      await applyPlaylistModification(playlistUri, {
        operation: "move",
        rows: orderedUids,
        before: firstUnselectedItem.uid,
      });

      Spicetify.showNotification(
        orderedUids.length > 1
          ? `Moved ${orderedUids.length} tracks to the top`
          : "Moved track to the top",
        false
      );
    } catch (error) {
      console.error("[Move To Top] Failed to move playlist tracks:", error);
      Spicetify.showNotification("Failed to move track to the top", true);
    }
  }

  function shouldAddMenuItem(uris, uids, contextUri) {
    console.debug("[Move To Top] Context menu args", { uris, uids, contextUri });

    if (!Array.isArray(uris) || !uris.length) {
      return false;
    }

    return uris.some(isTrackUri);
  }

  console.log("[Move To Top] Extension loaded");
  Spicetify.showNotification("Move To Top loaded", false);

  new Spicetify.ContextMenu.Item(
    MENU_LABEL,
    moveTracksToTop,
    shouldAddMenuItem,
    "chart-up"
  ).register();
})();
