import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { watchTags, type TagRecord } from './tags.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

export interface TagsManagerProps {
  db: Firestore
}

/** The Tags sub-page of Settings: every live Tag, used by an Item or not. */
export function TagsManager({ db }: TagsManagerProps) {
  const [tags, setTags] = useState<TagRecord[]>([])

  useEffect(() => watchTags(db, setTags), [db])

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <ul>
        {tags.map((tag) => (
          <ListRow key={tag.id} headline={tag.name} />
        ))}
      </ul>
    </section>
  )
}
