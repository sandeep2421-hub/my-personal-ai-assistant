import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "AIzaSyDsbw12Q6K6d7ysss6-6hw3DSOyNZQsE6s",
  authDomain:        "study-ai-f0bd7.firebaseapp.com",
  projectId:         "study-ai-f0bd7",
  storageBucket:     "study-ai-f0bd7.firebasestorage.app",
  messagingSenderId: "86586783448",
  appId:             "1:86586783448:web:2dc44de56b7bfb2799c9ad"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
