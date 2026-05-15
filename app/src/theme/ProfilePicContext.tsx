import React, { createContext, useContext, useState } from 'react';

interface ProfilePicContextType {
  recentAvatars: Record<string, string>;
  updateAvatar: (userId: string, url: string) => void;
}

const ProfilePicContext = createContext<ProfilePicContextType>({
  recentAvatars: {},
  updateAvatar: () => {},
});

export const ProfilePicProvider = ({ children }: { children: React.ReactNode }) => {
  const [recentAvatars, setRecentAvatars] = useState<Record<string, string>>({});

  const updateAvatar = (userId: string, url: string) => {
    setRecentAvatars(prev => ({ ...prev, [userId]: url }));
    // Clear after 5 seconds when Firestore has likely synced
    setTimeout(() => {
      setRecentAvatars(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 5000);
  };

  return (
    <ProfilePicContext.Provider value={{ recentAvatars, updateAvatar }}>
      {children}
    </ProfilePicContext.Provider>
  );
};

export const useProfilePic = () => useContext(ProfilePicContext);
