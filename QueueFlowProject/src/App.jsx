import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db } from "./firebase";
import { auth } from "./firebase";
import CustomerAuth from "./CustomerAuth";
import ProviderAuth from "./ProviderAuth";

/* ════════════════════════════════════════════════════════════════
   HISTORICAL DATA  — 14 days × 13 hourly slots × 4 services
   Format: { dayOfWeek(0=Sun..6=Sat) → hourSlot(8..20) → avgPeopleInQueue }
   Realistic patterns: Mon–Fri busy mornings & lunch, weekends lighter.
   Bank: heavier Mon/Fri; Post: heavier Mon; both lighter 14:00–15:00
════════════════════════════════════════════════════════════════ */
const HISTORICAL = {
  bank: {
    account: {
      0: { 8: 1, 9: 2, 10: 3, 11: 3, 12: 2, 13: 2, 14: 2, 15: 3, 16: 2, 17: 1, 18: 1, 19: 0, 20: 0 },
      1: { 8: 4, 9: 8, 10: 10, 11: 12, 12: 9, 13: 7, 14: 5, 15: 8, 16: 10, 17: 9, 18: 6, 19: 3, 20: 1 },
      2: { 8: 3, 9: 7, 10: 9, 11: 10, 12: 8, 13: 6, 14: 4, 15: 7, 16: 8, 17: 7, 18: 5, 19: 2, 20: 1 },
      3: { 8: 3, 9: 6, 10: 8, 11: 9, 12: 8, 13: 6, 14: 4, 15: 6, 16: 7, 17: 6, 18: 4, 19: 2, 20: 1 },
      4: { 8: 4, 9: 7, 10: 9, 11: 11, 12: 8, 13: 7, 14: 5, 15: 8, 16: 9, 17: 8, 18: 6, 19: 3, 20: 1 },
      5: { 8: 5, 9: 10, 10: 13, 11: 14, 12: 10, 13: 8, 14: 6, 15: 10, 17: 12, 16: 11, 18: 7, 19: 4, 20: 2 },
      6: { 8: 2, 9: 4, 10: 6, 11: 7, 12: 5, 13: 4, 14: 3, 15: 5, 16: 4, 17: 3, 18: 2, 19: 1, 20: 0 },
    },
    loan: {
      0: { 8: 0, 9: 1, 10: 2, 11: 2, 12: 1, 13: 1, 14: 1, 15: 2, 16: 1, 17: 1, 18: 0, 19: 0, 20: 0 },
      1: { 8: 2, 9: 4, 10: 6, 11: 7, 12: 5, 13: 4, 14: 3, 15: 5, 16: 6, 17: 5, 18: 3, 19: 2, 20: 1 },
      2: { 8: 2, 9: 3, 10: 5, 11: 6, 12: 8,