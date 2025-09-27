import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart3, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  LogOut,
  GraduationCap,
  TrendingUp,
  Heart
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Report {
  id: string;
  conversation_id: string;
  severity_level: number;
  categories: string[];
  summary: string;
  recommendations: string;
  key_concerns: string[];
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface TeacherDashboardProps {
  user: User;
  onSignOut: () => void;
}

const severityLabels = {
  1: 'Low',
  2: 'Mild', 
  3: 'Moderate',
  4: 'High',
  5: 'Critical'
};

const severityColors = {
  1: 'bg-severity-1',
  2: 'bg-severity-2', 
  3: 'bg-severity-3',
  4: 'bg-severity-4',
  5: 'bg-severity-5'
};

const categoryLabels = {
  academic: 'Academic',
  social: 'Social',
  family: 'Family',
  anxiety: 'Anxiety',
  depression: 'Depression',
  bullying: 'Bullying',
  physical_harm: 'Physical Harm',
  eating_disorder: 'Eating Disorder',
  substance_abuse: 'Substance Abuse',
  self_harm: 'Self Harm',
  other: 'Other'
};

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onSignOut }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    thisWeek: 0,
    categories: {} as Record<string, number>
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          profiles(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReports(data || []);
      calculateStats(data || []);
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (reportsData: Report[]) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const categories: Record<string, number> = {};
    let critical = 0;
    let thisWeek = 0;

    reportsData.forEach(report => {
      // Count critical reports
      if (report.severity_level >= 4) {
        critical++;
      }

      // Count reports from this week
      if (new Date(report.created_at) > oneWeekAgo) {
        thisWeek++;
      }

      // Count categories
      report.categories.forEach(category => {
        categories[category] = (categories[category] || 0) + 1;
      });
    });

    setStats({
      total: reportsData.length,
      critical,
      thisWeek,
      categories
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTopCategories = () => {
    return Object.entries(stats.categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({
        category: categoryLabels[category as keyof typeof categoryLabels] || category,
        count
      }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted to-primary/10 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center mx-auto animate-pulse">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-primary/10">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-gentle">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">MindWell Dashboard</h1>
              <p className="text-sm text-muted-foreground">Student Wellbeing Analytics</p>
            </div>
          </div>
          <Button
            onClick={onSignOut}
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Reports
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All-time therapy sessions
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                High Priority
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.critical}</div>
              <p className="text-xs text-muted-foreground">
                Level 4-5 severity reports
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                This Week
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.thisWeek}</div>
              <p className="text-xs text-muted-foreground">
                Recent therapy sessions
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Students
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {new Set(reports.map(r => r.profiles.full_name)).size}
              </div>
              <p className="text-xs text-muted-foreground">
                Unique students served
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reports" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="reports" className="data-[state=active]:bg-background">
              Recent Reports
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-background">
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            {reports.length === 0 ? (
              <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
                <CardContent className="text-center py-12">
                  <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Reports Yet</h3>
                  <p className="text-muted-foreground">
                    Student therapy reports will appear here once sessions are completed.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <Card key={report.id} className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg text-foreground">
                            {report.profiles.full_name}
                          </CardTitle>
                          <CardDescription className="text-muted-foreground">
                            {formatDate(report.created_at)}
                          </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge 
                            className={`${severityColors[report.severity_level as keyof typeof severityColors]} text-white border-0`}
                          >
                            Level {report.severity_level} - {severityLabels[report.severity_level as keyof typeof severityLabels]}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium text-foreground mb-2">Summary</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {report.summary}
                        </p>
                      </div>

                      {report.categories.length > 0 && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Categories</h4>
                          <div className="flex flex-wrap gap-2">
                            {report.categories.map((category) => (
                              <Badge
                                key={category}
                                variant="secondary"
                                className="bg-secondary text-secondary-foreground"
                              >
                                {categoryLabels[category as keyof typeof categoryLabels] || category}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {report.key_concerns.length > 0 && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Key Concerns</h4>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            {report.key_concerns.map((concern, index) => (
                              <li key={index}>{concern}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {report.recommendations && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Recommendations</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {report.recommendations}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-foreground">Top Concern Categories</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Most common issues reported by students
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {getTopCategories().map(({ category, count }) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{category}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500"
                              style={{ width: `${(count / Math.max(...Object.values(stats.categories))) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card border-0 bg-card/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-foreground">Severity Distribution</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Breakdown of report severity levels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(level => {
                      const count = reports.filter(r => r.severity_level === level).length;
                      const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                      
                      return (
                        <div key={level} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${severityColors[level as keyof typeof severityColors]}`} />
                            <span className="text-sm font-medium text-foreground">
                              Level {level} - {severityLabels[level as keyof typeof severityLabels]}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-muted-foreground">
                              {percentage.toFixed(1)}%
                            </span>
                            <span className="text-sm text-muted-foreground w-8 text-right">
                              ({count})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TeacherDashboard;