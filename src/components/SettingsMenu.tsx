/**
 * @author Colin Brown
 * @description Settings menu navigation component for selecting between different settings sections
 * @fileformat React Component
 */

import { List, ListItemButton, ListItemText } from "@mui/material";

export interface SettingsMenuOption {
  id: string;
  label: string;
}

interface SettingsMenuProps {
  options: SettingsMenuOption[];
  selectedOption: string;
  onSelect: (id: string) => void;
}

export default function SettingsMenu({
  options,
  selectedOption,
  onSelect,
}: SettingsMenuProps) {
  return (
    <List component="nav" sx={{ p: 0 }}>
      {options.map((option) => (
        <ListItemButton
          key={option.id}
          selected={selectedOption === option.id}
          onClick={() => onSelect(option.id)}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <ListItemText primary={option.label} />
        </ListItemButton>
      ))}
    </List>
  );
}
