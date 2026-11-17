import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Ball } from "./components/Ball";
import "./index.css";

// 同一个前端包同时服务主窗口和悬浮球窗口（ball 窗口 URL 带 #ball）
const isBallWindow = window.location.hash.replace("#", "").startsWith("ball");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isBallWindow ? (
    <Ball />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ),
);
