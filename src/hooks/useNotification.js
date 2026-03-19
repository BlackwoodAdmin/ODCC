import { useContext } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';
export default function useNotification() { return useContext(NotificationContext); }
