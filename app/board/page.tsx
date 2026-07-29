import { redirect } from "next/navigation";

// /board defaults to the API board. (Middleware handles auth before we get here.)
export default function BoardsIndexPage() {
  redirect("/board/api");
}
