// React import kept for potential future use
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
