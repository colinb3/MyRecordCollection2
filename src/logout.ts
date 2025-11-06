import apiUrl from "./api";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCollectionRecordsCache } from "./collectionRecords";
import { clearProfileHighlightsCache } from "./profileHighlights";
import { clearCommunityCaches } from "./communityUsers";
import { clearUserInfoCache } from "./userInfo";
import { setUserId } from "./analytics";

/**
 * Performs a complete logout operation:
 * - Calls the backend logout endpoint
 * - Clears all cached data
 * - Clears analytics user ID
 * - Navigates to the login page
 * 
 * @param navigate - The react-router navigate function
 */
export async function performLogout(navigate: (path: string) => void): Promise<void> {
  await fetch(apiUrl("/api/logout"), {
    method: "POST",
    credentials: "include",
  });
  
  clearRecordTablePreferencesCache();
  clearCollectionRecordsCache();
  clearProfileHighlightsCache();
  clearCommunityCaches();
  clearUserInfoCache();
  
  try {
    setUserId(undefined);
  } catch {
    /* ignore analytics errors */
  }
  
  navigate("/login");
}
