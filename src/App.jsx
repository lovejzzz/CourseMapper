import React from 'react';
import { CourseStoreProvider } from './model/courseStore.jsx';
import Workspace from './screens/Workspace.jsx';

export default function App() {
  return (
    <CourseStoreProvider>
      <Workspace />
    </CourseStoreProvider>
  );
}
