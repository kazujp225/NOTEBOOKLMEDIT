'use client';

import { Editor } from '@/components/editor/Editor';

interface ProjectPageProps {
  params: { id: string };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  return <Editor projectId={params.id} />;
}
