import { connect } from 'react-redux';
import { IStore } from '../../reducers';
import {
  ProfessorForm,
  IProfessorFormDispatchProps,
  IProfessorFormValueProps,
  IProfessorContainerProps,
} from '../../components';
import { professorActions } from "../../actions";
import { withRouter } from "react-router";

const mapStateToProps = (state: IStore, ownProps: IProfessorContainerProps): IProfessorFormValueProps => {
  const { id } = ownProps.match.params;
  const professor: IProfessor | undefined = id ? state.professors[id] : undefined;

  return {
    professor,
  };
};

const mapDispatchToProps = (dispatch: (action: any) => any | void, props: IProfessorContainerProps): IProfessorFormDispatchProps => ({
  onSubmit: function (professor: IProfessor) {
    dispatch(professorActions.createProfessor(professor));
  },

  onCancel() {
    props.history.push('/');
  },
});

export default withRouter((connect(mapStateToProps, mapDispatchToProps) as any)(ProfessorForm)) as typeof ProfessorForm;