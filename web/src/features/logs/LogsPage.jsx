import React from "react";
import ActivityPage from "../activity/ActivityPage";

/**
 * The event stream is the current panel-wide log view. Keep this route
 * separate so service log viewers can grow without changing navigation.
 */
export default function LogsPage() {
  return <ActivityPage />;
}
